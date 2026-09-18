/**
 * `actions/chat.ts` is server-marked ("use server") and gets dropped by
 * sync-ui.mjs's SERVER_MARKERS filter — but `message-actions.tsx` still
 * imports `voteMessage`/`saveMessageAsArtifact` at module scope. Both
 * are only ever called from a click handler a static render never
 * fires, so a same-shaped no-op is enough to keep the module resolving.
 */
export type ChatActionResult<T> =
  { success: true; data: T } | { success: false; error: string };

export async function voteMessage(
  _conversationId: string,
  _messageId: string,
  _vote: "up" | "down" | null,
): Promise<ChatActionResult<undefined>> {
  return { success: true, data: undefined };
}

export async function saveMessageAsArtifact(_params: {
  messageId: string;
  content: string;
  title?: string;
  conversationId?: string;
}): Promise<ChatActionResult<{ id: string; title: string }>> {
  return { success: true, data: { id: "art_preview", title: "Preview" } };
}
