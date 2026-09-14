import { listConversationHistory } from "@/actions/chat";
import { ChatHistoryNav } from "./chat-history-nav";

export async function ChatHistory() {
  const result = await listConversationHistory();
  if (!result.success) return null;
  return <ChatHistoryNav conversations={result.data} />;
}
