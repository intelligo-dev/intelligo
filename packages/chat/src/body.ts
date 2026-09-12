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

import { extractText } from "./windowing";

export type ChatAttachmentPolicy = {
  /** Media types a file part may carry, e.g. `["image/jpeg", "image/png"]`. */
  accept: readonly string[];
  /** Largest data-URL payload accepted, in bytes. Unbounded when omitted. */
  maxBytes?: number;
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
  | { ok: true; body: ChatBody }
  | { ok: false; rejection: ChatBodyRejection };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(["system", "user", "assistant"]);
const SDK_FIELDS = new Set(["id", "messages", "trigger", "messageId"]);

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

function rejectedAttachment(
  message: UIMessage,
  policy: ChatAttachmentPolicy | false
): boolean {
  for (const part of message.parts) {
    if (part.type !== "file") continue;
    if (policy === false) return true;
    const file = part as { mediaType?: unknown; url?: unknown };
    if (
      typeof file.mediaType !== "string" ||
      !policy.accept.includes(file.mediaType)
    ) {
      return true;
    }
    if (policy.maxBytes !== undefined && typeof file.url === "string") {
      const bytes = dataUrlBytes(file.url);
      if (bytes !== null && bytes > policy.maxBytes) return true;
    }
  }
  return false;
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

  const messages = json.messages as UIMessage[];
  const last = messages[messages.length - 1]!;
  if (last.role === "user") {
    const length = extractText(last.parts).length;
    if (length > options.maxMessageLength) {
      return {
        ok: false,
        rejection: {
          key: "messageTooLong",
          params: { max: options.maxMessageLength },
        },
      };
    }
    if (rejectedAttachment(last, options.attachments)) {
      return { ok: false, rejection: { key: "attachmentRejected" } };
    }
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
