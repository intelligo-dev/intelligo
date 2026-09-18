/**
 * Stream a document into the chat canvas from inside a tool, as three
 * calls over one `data-chat-artifact` part:
 *
 *     const doc = createArtifactWriter(turn, { kind: "text", title });
 *     for (const chunk of chunks) doc.append(chunk);
 *     const saved = await saveDocument(actor, { id: doc.id, title, content, kind });
 *     doc.finish({ documentId: saved.id });
 *
 * Deltas are transient parts under the writer's `id` — the client
 * accumulates them and nothing is persisted mid-stream. The `ready`
 * part is persisted, so the message's card reopens the document from
 * `documentId` after a reload; `error` is persisted too, so a failed
 * document does not reload as a blank card.
 */

import type { ChatArtifactData, ChatDataChunk } from "./parts";

export type ArtifactWriterOptions = {
  kind: string;
  title: string;
  /** The part id, and the default document id. A fresh UUID when omitted. */
  id?: string;
};

export type ArtifactWriter = {
  readonly id: string;
  /** Stream one increment. The first call opens the canvas. */
  append: (delta: string) => void;
  /**
   * Mark the document ready. `content` is persisted in the part only
   * when passed — a document that lives in the documents table is
   * reopened from `documentId` instead.
   */
  finish: (result?: {
    documentId?: string;
    version?: number;
    content?: string;
    title?: string;
  }) => void;
  fail: (error: unknown) => void;
  /** Everything appended so far. */
  readonly content: string;
};

export function createArtifactWriter(
  turn: { write: (chunk: ChatDataChunk) => void },
  options: ArtifactWriterOptions
): ArtifactWriter {
  const id = options.id ?? crypto.randomUUID();
  let title = options.title;
  let content = "";
  let opened = false;
  let closed = false;

  const emit = (data: ChatArtifactData, transient: boolean) => {
    turn.write({
      type: "data-chat-artifact",
      id,
      data,
      ...(transient ? { transient: true } : {}),
    });
  };

  const base = (): ChatArtifactData => ({
    id,
    kind: options.kind,
    title,
    status: "streaming",
  });

  return {
    id,
    get content() {
      return content;
    },
    append(delta) {
      if (closed) return;
      content += delta;
      if (!opened) {
        opened = true;
        emit(base(), true);
      }
      emit({ ...base(), delta }, true);
    },
    finish(result = {}) {
      if (closed) return;
      closed = true;
      if (result.title) title = result.title;
      emit(
        {
          ...base(),
          status: "ready",
          ...(result.documentId ? { documentId: result.documentId } : {}),
          ...(result.version !== undefined ? { version: result.version } : {}),
          ...(result.content !== undefined ? { content: result.content } : {}),
        },
        false
      );
    },
    fail(error) {
      if (closed) return;
      closed = true;
      emit(
        {
          ...base(),
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
        false
      );
    },
  };
}
