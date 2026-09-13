import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";

import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { ConversationHeader } from "@/components/chat/conversation-header";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import {
  listConversationHistory,
  loadConversationForChat,
} from "@/actions/chat";
import { getChatModelOptions } from "@/lib/chat-models";
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
  const { workspace } = await requireWorkspace();

  // In parallel: the quota read is an estimate that holds no credit,
  // so it cannot slow down or interfere with loading the conversation.
  const [conversationResult, historyResult, quotaState, models] =
    await Promise.all([
      loadConversationForChat(id),
      listConversationHistory(),
      getChatQuotaState(),
      getChatModelOptions(workspace.id),
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

  const { conversation, messages, votes } = conversationResult.data;
  const conversations = historyResult.success ? historyResult.data : [];

  return (
    <div className="flex h-full">
      <ConversationSidebar
        conversations={conversations}
        activeId={id}
        className="hidden lg:flex"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader
          conversationId={id}
          title={conversation?.title ?? null}
          conversations={conversations}
        />
        <ChatWorkspace
          conversationId={id}
          initialMessages={messages}
          quotaState={quotaState}
          votes={votes}
          models={models}
        />
      </div>
    </div>
  );
}
