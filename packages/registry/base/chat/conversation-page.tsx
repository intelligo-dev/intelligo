import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Chat } from "@/components/chat/chat-panel";
import { ConversationHeader } from "@/components/chat/conversation-header";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import {
  listConversationHistory,
  loadConversationForChat,
} from "@/actions/chat";
import { getChatQuotaState } from "@/lib/chat-quota";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat");
  return { title: t("conversationPage.title") };
}

/**
 * `dynamic = "force-dynamic"`: `loadConversationForChat`/
 * `listConversationHistory` read request-scoped session and workspace
 * state (`requireWorkspace()`, inside `@/actions/chat`), so this page
 * can only ever render per-request.
 */
export const dynamic = "force-dynamic";

interface ConversationPageProps {
  params: Promise<{ id: string; locale: string }>;
}

export default async function ConversationPage({
  params,
}: ConversationPageProps) {
  const { id } = await params;
  const t = await getTranslations("chat");

  // In parallel: the quota read is an estimate that holds no credit,
  // so it cannot slow down or interfere with loading the conversation.
  const [conversationResult, historyResult, quotaState] = await Promise.all([
    loadConversationForChat(id),
    listConversationHistory(),
    getChatQuotaState(),
  ]);

  if (!conversationResult.success) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-lg font-semibold">
          {t("conversationPage.unavailableTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {conversationResult.error}
        </p>
      </div>
    );
  }

  const { conversation, messages } = conversationResult.data;
  const conversations = historyResult.success ? historyResult.data : [];
  // The header's dropdown is the small-screen fallback for the
  // sidebar, and there it lists somewhere to go — so the conversation
  // already on screen is filtered out of it, but not out of the
  // sidebar, which highlights it instead.
  const history = conversations.filter((item) => item.id !== id);

  return (
    <div className="flex h-full">
      <ConversationSidebar conversations={conversations} activeId={id} />

      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader
          conversationId={id}
          title={conversation?.title ?? null}
          history={history}
        />
        <Chat
          conversationId={id}
          initialMessages={messages}
          quotaState={quotaState}
        />
      </div>
    </div>
  );
}
