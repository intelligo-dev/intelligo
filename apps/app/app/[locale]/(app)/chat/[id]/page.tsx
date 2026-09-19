import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { requireWorkspace } from "@intelligo-dev/auth";

import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { ConversationHeader } from "@/components/chat/conversation-header";
import { loadConversationForChat } from "@/actions/chat";
import { getChatModelOptions } from "@/lib/chat-models";
import { getChatQuotaState, getChatQuotaStates } from "@/lib/chat-quota";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat");
  return { title: t("conversationPage.title") };
}

/**
 * `dynamic = "force-dynamic"`: `loadConversationForChat` reads
 * request-scoped session and workspace state (`requireWorkspace()`,
 * inside `@/actions/chat`), so this page can only ever render
 * per-request. History is the shell's (`ChatHistory` in the sidebar).
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
  // One estimate per offered model, because the pick lives in the
  // browser and each model has its own worst case.
  const modelOptions = getChatModelOptions(workspace.id);
  const [conversationResult, quotaState, quotaStates, models] =
    await Promise.all([
      loadConversationForChat(id),
      getChatQuotaState(),
      modelOptions.then((options) =>
        getChatQuotaStates(options.map((option) => option.id))
      ),
      modelOptions,
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ConversationHeader
        conversationId={id}
        title={conversation?.title ?? null}
      />
      <ChatWorkspace
        conversationId={id}
        initialMessages={messages}
        quotaState={quotaState}
        quotaStates={quotaStates}
        votes={votes}
        models={models}
      />
    </div>
  );
}
