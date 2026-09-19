/**
 * Stored attachments: the upload route and the route that serves them.
 *
 * Inline attachments (the default policy) travel inside the message as
 * data URLs and need nothing here. A deployment that wants files
 * outside the transcript — larger than a message should carry, kept
 * after the conversation is shared, extracted to text for the model —
 * sets `attachments.mode: "stored"`, binds a storage adapter from its
 * composition root, and mounts these two handlers:
 *
 *     // app/api/chat/upload/route.ts
 *     export const { POST } = createChatUploadHandler(chatServerConfig);
 *     // app/api/chat/attachments/[id]/route.ts
 *     export const { GET } = createChatAttachmentHandler(chatServerConfig);
 *
 * The upload answers `{ id, url, filename, mediaType, size }`; the
 * composer puts `url` in the file part; the transport signs it for the
 * model and persists the app URL, which this route redirects to a
 * fresh signed URL for anyone in the workspace who can open the
 * conversation. No signed URL is ever persisted or shared.
 */

import { requireWorkspace } from "@intelligo-dev/auth";
import {
  createAttachment,
  getAttachment,
  isAttachmentServiceError,
  setExtractedText,
} from "@intelligo-dev/core/attachments";
import { createLogger } from "@intelligo-dev/core/logger";
import {
  attachmentStorageKey,
  getStorageAdapter,
  StorageUnavailableError,
} from "@intelligo-dev/core/storage";

import { ATTACHMENT_MAX_BYTES, attachmentUrl } from "./body";

/** Room for the multipart boundaries and headers around the file. */
const FORM_OVERHEAD_BYTES = 64 * 1024;
import type { ChatActor, ChatServerConfig } from "./config";
import { DEFAULT_CHAT_MESSAGES, refuse } from "./errors";

const log = createLogger("Chat");

const SIGNED_URL_SECONDS = 900;

export type ChatUploadResult = {
  id: string;
  url: string;
  filename: string;
  mediaType: string;
  size: number;
};

export type ChatUploadHandler = {
  POST: (request: Request) => Promise<Response>;
};

export type ChatAttachmentHandler = {
  GET: (
    request: Request,
    context: { params: { id: string } | Promise<{ id: string }> }
  ) => Promise<Response>;
};

async function defaultAuthenticate(): Promise<ChatActor> {
  const { workspace, user } = await requireWorkspace();
  return { workspaceId: workspace.id, userId: user.id };
}

function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\x00-\x1f]/g, "").slice(0, 255) || "file";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `POST multipart/form-data` with one `file` field → an attachment row
 * and the URL the composer puts in the file part. Refuses a type the
 * policy does not accept, a file over `maxBytes`, and anything without
 * a session.
 */
export function createChatUploadHandler(
  config: ChatServerConfig
): ChatUploadHandler {
  const authenticate = config.authenticate ?? defaultAuthenticate;
  const policy = config.attachments;

  async function messagesFor(request: Request) {
    return config.messages ? config.messages(request) : DEFAULT_CHAT_MESSAGES;
  }

  async function POST(request: Request): Promise<Response> {
    await config.onRequest?.();
    const t = await messagesFor(request);

    if (!policy || policy.mode !== "stored") {
      return refuse("BAD_REQUEST", t("attachmentRejected"));
    }

    let actor: ChatActor;
    try {
      actor = await authenticate(request);
    } catch {
      return refuse("UNAUTHORIZED", t("unauthorized"));
    }

    // Refused before the body is read: `formData()` buffers all of it.
    const maxBytes = policy.maxBytes ?? ATTACHMENT_MAX_BYTES;
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes + FORM_OVERHEAD_BYTES) {
      return refuse("BAD_REQUEST", t("attachmentRejected"));
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return refuse("BAD_REQUEST", t("invalidBody"));
    }
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return refuse("BAD_REQUEST", t("invalidBody"));
    }
    const mediaType = file.type || "application/octet-stream";
    if (!policy.accept.includes(mediaType)) {
      return refuse("BAD_REQUEST", t("attachmentRejected"));
    }
    if (file.size > maxBytes) {
      return refuse("BAD_REQUEST", t("attachmentRejected"));
    }

    let storage;
    try {
      storage = getStorageAdapter();
    } catch (error) {
      if (error instanceof StorageUnavailableError) {
        log.error("Attachment upload with no storage adapter bound");
        return refuse("INTERNAL", t("internalError"));
      }
      throw error;
    }

    const id = crypto.randomUUID();
    const filename = safeFilename(
      typeof (file as File).name === "string" ? (file as File).name : "file"
    );
    const key = attachmentStorageKey(actor.workspaceId, id);

    try {
      await storage.put({
        key,
        body: file,
        contentType: mediaType,
        contentLength: file.size,
      });
      await createAttachment(actor, {
        id,
        storageKey: key,
        filename,
        mediaType,
        sizeBytes: file.size,
      });
    } catch (error) {
      log.error("Attachment upload failed", { error: errorMessage(error) });
      return refuse("INTERNAL", t("internalError"));
    }

    // Text extraction is best effort: a PDF that will not parse still
    // uploads, and the model gets the file part alone.
    if (policy.extractText && !mediaType.startsWith("image/")) {
      try {
        const text = await policy.extractText({
          id,
          filename,
          mediaType,
          bytes: async () => new Uint8Array(await file.arrayBuffer()),
        });
        if (text) await setExtractedText(actor, { id, text });
      } catch (error) {
        log.warn("Attachment text extraction failed", {
          attachmentId: id,
          error: errorMessage(error),
        });
      }
    }

    const result: ChatUploadResult = {
      id,
      url: attachmentUrl(policy, id),
      filename,
      mediaType,
      size: file.size,
    };
    return Response.json(result, { status: 201 });
  }

  return { POST };
}

/**
 * `GET /api/chat/attachments/[id]` → a redirect to a short-lived signed
 * URL, for anyone signed in to the attachment's workspace. The app URL
 * is what the transcript persists, so it must keep working after the
 * signed one expires.
 */
export function createChatAttachmentHandler(
  config: ChatServerConfig
): ChatAttachmentHandler {
  const authenticate = config.authenticate ?? defaultAuthenticate;

  async function messagesFor(request: Request) {
    return config.messages ? config.messages(request) : DEFAULT_CHAT_MESSAGES;
  }

  async function GET(
    request: Request,
    context: { params: { id: string } | Promise<{ id: string }> }
  ): Promise<Response> {
    await config.onRequest?.();
    const t = await messagesFor(request);
    const { id } = await context.params;

    let actor: ChatActor;
    try {
      actor = await authenticate(request);
    } catch {
      return refuse("UNAUTHORIZED", t("unauthorized"));
    }

    try {
      const row = await getAttachment(actor, id);
      const url = await getStorageAdapter().getSignedUrl(row.storageKey, {
        expiresInSeconds: SIGNED_URL_SECONDS,
        disposition: "inline",
        filename: row.filename,
      });
      return new Response(null, {
        status: 302,
        headers: { location: url, "cache-control": "private, no-store" },
      });
    } catch (error) {
      if (isAttachmentServiceError(error) && error.code === "not_found") {
        return refuse("NOT_FOUND", t("notFound"));
      }
      log.error("Attachment read failed", {
        attachmentId: id,
        error: errorMessage(error),
      });
      return refuse("INTERNAL", t("internalError"));
    }
  }

  return { GET };
}
