/**
 * Between the rows core stores and the transcript the AI SDK renders.
 */

import type { UIMessage } from "ai";

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
