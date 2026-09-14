/**
 * The conversation history for the shell's sidebar — bind it as
 * `sidebarContent` in `lib/shell-config.tsx`:
 *
 *   import { ChatHistory } from "@/components/chat/chat-history";
 *
 *   export const shellConfig: ShellConfig = { sidebarContent: ChatHistory };
 *
 * A server component: the list arrives with the page, and anything that
 * changes it — a new conversation's title, a rename, a delete — calls
 * `router.refresh()`, which renders it again.
 */

import { listConversationHistory } from "@/actions/chat";
import { ChatHistoryNav } from "./chat-history-nav";

export async function ChatHistory() {
  const result = await listConversationHistory();
  if (!result.success) return null;
  return <ChatHistoryNav conversations={result.data} />;
}
