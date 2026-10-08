/**
 * The request body, validated by hand.
 *
 * Not zod: a schema library in a package's public surface would have
 * to be a peer (its `instanceof` fails across copies), and the body
 * has four fields. The shape is the AI SDK's `DefaultChatTransport`
 * one — `id`, `messages`, `trigger`, `messageId` — plus whatever the
 * application's transport added, which is handed back untouched as
 * `extra` for `resolveAgent` to read (an `agentId`, a model choice).
 */

import type { UIMessage } from "ai";

import type { RateLimitDecision } from "./config";
import { ELIDED_FILE_URL } from "./elide";
import { extractText } from "./windowing";

export type ChatAttachmentPolicy = {
  /** Media types a file part may carry, e.g. `["image/jpeg", "image/png"]`. */
  accept: readonly string[];
  /** Largest payload accepted, in bytes. `ATTACHMENT_MAX_BYTES` when omitted. */
  maxBytes?: number;
  /**
   * `inline` (default): the file travels in the message as a data URL
   * and is persisted with it; a part with any other URL is refused. `stored`: the file was uploaded first
   * through the upload route and the part carries the app URL the
   * attachment route serves; the transport signs it for the model.
   */
  mode?: "inline" | "stored";
  /** The app URL of a stored attachment. Default `/api/chat/attachments/<id>`. */
  urlFor?: (id: string) => string;
  /**
   * Turns a stored, non-image file into text for the model — a PDF, a
   * spreadsheet. Runs once, at upload; the text is kept on the row and
   * appended to the message the model sees. Unset: the file part is
   * passed through as-is and the provider decides what to do with it.
   */
  extractText?: (file: {
    id: string;
    filename: string;
    mediaType: string;
    bytes: () => Promise<Uint8Array>;
  }) => Promise<string | null>;
  /**
   * How often the upload route accepts a file from a workspace. Default:
   * the workspace plan's per-minute rate, counted apart from chat turns;
   * `false` disables it, as the config's `rateLimit: false` does.
   */
  rateLimit?:
    | false
    | ((actor: {
        workspaceId: string;
        userId: string;
      }) => Promise<RateLimitDecision>);
  /**
   * Bytes a workspace may hold in uploads no turn has claimed yet; an
   * upload past it is refused until a turn claims them or the sweep
   * deletes them. Default ten times `maxBytes`; `false`: no cap.
   */
  maxUnclaimedBytes?: number | false;
  /**
   * The deployment's own storage quota — per plan, per user. Return
   * false to refuse the upload as over quota; runs after the file is
   * read and before anything is stored.
   */
  admitUpload?: (
    actor: { workspaceId: string; userId: string },
    file: { filename: string; mediaType: string; size: number }
  ) => boolean | Promise<boolean>;
};

export type ChatBody = {
  id: string;
  messages: UIMessage[];
  trigger: "submit-message" | "regenerate-message" | undefined;
  messageId: string | undefined;
  /** Fields the application's transport added beyond the SDK's own. */
  extra: Record<string, unknown>;
};

export type ChatBodyRejection = {
  key: "invalidBody" | "messageTooLong" | "attachmentRejected";
  params?: Record<string, string | number>;
};

export type ParsedChatBody =
  { ok: true; body: ChatBody } | { ok: false; rejection: ChatBodyRejection };

/** 10 MB: the limit a policy that names none gets. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * No `system`: the system prompt is the server's. A client that could
 * send one could rewrite the agent's instructions.
 */
const ROLES = new Set(["user", "assistant"]);
const SDK_FIELDS = new Set(["id", "messages", "trigger", "messageId"]);
const ID_PLACEHOLDER = "__ATTACHMENT_ID__";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUIMessage(value: unknown): value is UIMessage {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || !value.id) return false;
  if (typeof value.role !== "string" || !ROLES.has(value.role)) return false;
  if (!Array.isArray(value.parts)) return false;
  return value.parts.every(
    (part) => isRecord(part) && typeof part.type === "string"
  );
}

function dataUrlBytes(url: string): number | null {
  if (!url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma === -1) return null;
  const payload = url.slice(comma + 1);
  return url.slice(0, comma).endsWith(";base64")
    ? Math.floor((payload.length * 3) / 4)
    : payload.length;
}

/** The app URL of a stored attachment under this policy. */
export function attachmentUrl(
  policy: Pick<ChatAttachmentPolicy, "urlFor">,
  id: string
): string {
  return policy.urlFor ? policy.urlFor(id) : `/api/chat/attachments/${id}`;
}

/**
 * The attachment id a stored file part's URL names, or null when the
 * URL is not one this policy hands out. Absolute and relative forms
 * of the same path both match.
 */
export function attachmentIdFromUrl(
  policy: Pick<ChatAttachmentPolicy, "urlFor">,
  url: string
): string | null {
  const template = attachmentUrl(policy, ID_PLACEHOLDER);
  const at = template.indexOf(ID_PLACEHOLDER);
  if (at === -1) return null;
  const prefix = template.slice(0, at);
  const suffix = template.slice(at + ID_PLACEHOLDER.length);

  let path = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      path = parsed.pathname + parsed.search;
    } catch {
      return null;
    }
  }
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) return null;
  const id = path.slice(prefix.length, path.length - suffix.length);
  return id && !id.includes("/") ? id : null;
}

/**
 * Whether a file part a client sent may reach the model in a message
 * of this role. A user's file must fit the policy: in `stored` mode an
 * upload's URL, inline a data URL within `maxBytes`. An assistant's
 * file is one the model produced and only ever travels inline; any
 * other URL would have the server fetch whatever the client named.
 */
export function fileAccepted(
  part: { mediaType?: unknown; url?: unknown },
  role: UIMessage["role"],
  policy: ChatAttachmentPolicy | false
): boolean {
  if (typeof part.url !== "string") return false;
  if (role === "assistant") return part.url.startsWith("data:");
  if (role !== "user" || policy === false) return false;
  if (
    typeof part.mediaType !== "string" ||
    !policy.accept.includes(part.mediaType)
  ) {
    return false;
  }
  if (policy.mode === "stored") {
    // A stored part names an upload; the row is checked by the
    // handler, which knows the tenant. A data URL here bypassed the
    // upload route and its limits, so it is refused.
    return attachmentIdFromUrl(policy, part.url) !== null;
  }
  // An inline part carries its bytes, so its size is known here.
  const bytes = dataUrlBytes(part.url);
  return bytes !== null && bytes <= (policy.maxBytes ?? ATTACHMENT_MAX_BYTES);
}

function rejectedAttachment(
  message: UIMessage,
  policy: ChatAttachmentPolicy | false,
  earlier: boolean
): boolean {
  for (const part of message.parts) {
    if (part.type !== "file") continue;
    const file = part as { mediaType?: unknown; url?: unknown };
    // An earlier message's file sent without its bytes: the handler
    // restores the stored copy, or drops the part.
    if (earlier && file.url === ELIDED_FILE_URL) {
      if (message.role === "user" && policy === false) return true;
      continue;
    }
    if (!fileAccepted(file, message.role, policy)) return true;
  }
  return false;
}

/**
 * A user writes text and attaches files; tool calls, reasoning and
 * sources are the model's. A user message carrying one would be stored
 * as sent and read back as if the model had written it.
 */
function isUserPart(part: { type: string }): boolean {
  return (
    part.type === "text" ||
    part.type === "file" ||
    part.type.startsWith("data-")
  );
}

/**
 * A file part as the client may send it. A provider reference makes
 * the AI SDK hand the provider that file in place of the URL checked
 * here, so it is dropped with the provider metadata.
 */
function withoutProviderFields(message: UIMessage): UIMessage {
  if (!message.parts.some((part) => part.type === "file")) return message;
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type !== "file") return part;
      const {
        providerReference: _reference,
        providerMetadata: _metadata,
        ...rest
      } = part as typeof part & {
        providerReference?: unknown;
        providerMetadata?: unknown;
      };
      return rest as typeof part;
    }),
  };
}

export function parseChatBody(
  json: unknown,
  options: {
    maxMessageLength: number;
    attachments: ChatAttachmentPolicy | false;
  }
): ParsedChatBody {
  const invalid: ParsedChatBody = {
    ok: false,
    rejection: { key: "invalidBody" },
  };
  if (!isRecord(json)) return invalid;
  if (typeof json.id !== "string" || !UUID.test(json.id)) return invalid;
  if (!Array.isArray(json.messages) || json.messages.length === 0)
    return invalid;
  if (!json.messages.every(isUIMessage)) return invalid;
  if (
    json.trigger !== undefined &&
    json.trigger !== "submit-message" &&
    json.trigger !== "regenerate-message"
  ) {
    return invalid;
  }
  if (json.messageId !== undefined && typeof json.messageId !== "string") {
    return invalid;
  }

  const messages = (json.messages as UIMessage[]).map(withoutProviderFields);
  // Every message, not only the new one: the history is the client's
  // too, and a turn is billed for all of it.
  for (const [index, message] of messages.entries()) {
    const earlier = index < messages.length - 1;
    if (message.role !== "user") {
      if (rejectedAttachment(message, options.attachments, earlier)) {
        return { ok: false, rejection: { key: "attachmentRejected" } };
      }
      continue;
    }
    if (!message.parts.every(isUserPart)) return invalid;
    const length = extractText(message.parts).length;
    if (length > options.maxMessageLength) {
      return {
        ok: false,
        rejection: {
          key: "messageTooLong",
          params: { max: options.maxMessageLength },
        },
      };
    }
    if (rejectedAttachment(message, options.attachments, earlier)) {
      return { ok: false, rejection: { key: "attachmentRejected" } };
    }
  }

  const last = messages[messages.length - 1]!;
  if (last.role === "assistant") {
    // A turn that continues the assistant's own message — tool results
    // or approval answers added client-side — names that message. The
    // SDK sends exactly this; anything else is a hand-made body that
    // would make the reply a fresh message with the tool loop lost.
    if (json.trigger === "regenerate-message") return invalid;
    if (json.messageId !== last.id) return invalid;
  }

  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(json)) {
    if (!SDK_FIELDS.has(key)) extra[key] = value;
  }

  return {
    ok: true,
    body: {
      id: json.id,
      messages,
      trigger: json.trigger as ChatBody["trigger"],
      messageId: json.messageId as string | undefined,
      extra,
    },
  };
}
