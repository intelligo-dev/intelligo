/**
 * Between the rows core stores and the transcript the AI SDK renders.
 */

import type { UIMessage } from "ai";

import { ELIDED_FILE_URL, hasElidedFile } from "./elide";

type MessageRow = { id: string; role: string; parts: string };

function isChatRole(role: string): role is UIMessage["role"] {
  return role === "system" || role === "user" || role === "assistant";
}

/**
 * Stored `messages.parts` is a JSON string; a
 * row that fails to parse is dropped rather than failing the whole
 * conversation. Tool-role rows are not part of the UI transcript.
 */
export function toUIMessages(rows: ReadonlyArray<MessageRow>): UIMessage[] {
  const out: UIMessage[] = [];
  for (const row of rows) {
    if (!isChatRole(row.role)) continue;
    try {
      const parts = JSON.parse(row.parts) as unknown;
      if (!Array.isArray(parts)) continue;
      out.push({ id: row.id, role: row.role, parts });
    } catch {
      // A corrupt row costs one message, not the conversation.
    }
  }
  return out;
}

/** The last message when it is the user's turn, else null. */
export function lastUserMessage(
  messages: ReadonlyArray<UIMessage>
): UIMessage | null {
  const last = messages[messages.length - 1];
  return last?.role === "user" ? last : null;
}

/**
 * Puts back the files a client elided from earlier messages
 * (`elideEarlierFiles`), taking each from the stored copy of its
 * message: the n-th file part takes the stored message's n-th file.
 * A part with no stored file to take — the message was never stored,
 * or the deployment persists elsewhere — is dropped, so the model sees
 * the message without it rather than a placeholder.
 */
export function restoreElidedFiles(
  messages: UIMessage[],
  stored: ReadonlyArray<UIMessage>
): UIMessage[] {
  const byId = new Map(stored.map((message) => [message.id, message]));
  return messages.map((message) => {
    if (!hasElidedFile(message)) return message;
    const files = (byId.get(message.id)?.parts ?? []).filter(
      (part) => part.type === "file"
    );
    let fileIndex = 0;
    const parts: UIMessage["parts"] = [];
    for (const part of message.parts) {
      if (part.type !== "file") {
        parts.push(part);
        continue;
      }
      const original = files[fileIndex++];
      if ((part as { url?: unknown }).url !== ELIDED_FILE_URL) {
        parts.push(part);
      } else if (original) {
        parts.push(original);
      }
    }
    return { ...message, parts };
  });
}
