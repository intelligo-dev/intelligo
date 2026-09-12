"use client";

/**
 * Chat — client root. Owns streaming state via the AI SDK's `useChat`
 * (`@ai-sdk/react`), talking to `app/api/chat/route.ts` over a
 * `DefaultChatTransport`. `initialMessages` comes from the server
 * component (`app/[locale]/(app)/chat/[id]/page.tsx`, via
 * `@/actions/chat`) so reloading a conversation shows its history
 * immediately, with no client-side fetch-on-mount.
 *
 * A `?query=` search param seeds the first turn: another surface (the
 * dashboard's prompt bar, a marketing CTA) can mint a conversation id
 * and link straight into a started conversation. It is sent once, only
 * into an empty conversation, so a refresh doesn't replay it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useSearchParams } from "next/navigation";

import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";
import { CreditStatusBanner, type ChatBlock } from "./credit-status-banner";
import { chatConfig } from "@/lib/chat-config";
import type { ToolRendererActions } from "@/lib/chat-renderers";
import type { ChatQuotaState } from "@/lib/chat-quota";

/**
 * A refusal, or nothing. `executions.begin()` answers 402 with a typed
 * code when admission declines; anything else is a failure, not a
 * limit, and belongs in the error strip rather than the banner.
 *
 * At module scope so the effect that reads it has a stable reference
 * and needs no dependency entry.
 */
function refusalFrom(chatError: Error): ChatBlock | null {
  try {
    const parsed = JSON.parse(chatError.message) as {
      error?: string;
      code?: string;
    };
    return parsed.code && parsed.error
      ? { code: parsed.code, message: parsed.error }
      : null;
  } catch {
    return null;
  }
}

interface ChatProps {
  conversationId: string;
  initialMessages: UIMessage[];
  /**
   * Server-rendered credit state. Optional so a deployment that has
   * not wired billing renders the chat unchanged.
   */
  quotaState?: ChatQuotaState | null;
}

export function Chat({
  conversationId,
  initialMessages,
  quotaState = null,
}: ChatProps) {
  const t = useTranslations("chat");
  // Namespace-less: `chatConfig.starters` entries are fully-qualified
  // message keys into the app's whole message tree (see
  // `@/lib/chat-config`'s doc comment), not keys under this item's own
  // "chat" namespace.
  const tAny = useTranslations();
  const searchParams = useSearchParams();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { id: conversationId },
      }),
    [conversationId]
  );

  const {
    messages,
    sendMessage,
    regenerate,
    addToolResult,
    status,
    stop,
    error,
  } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: chatConfig.sendAutomaticallyWhen,
  });

  const isStreaming = status === "streaming" || status === "submitted";

  /**
   * A refusal the route returned mid-conversation.
   *
   * The server-rendered state is what the page opened with; the
   * balance can run out three turns later, and the reader should not
   * have to reload to be told.
   */
  const [block, setBlock] = useState<ChatBlock | null>(null);
  const blocked = block !== null || quotaState?.allowed === false;

  const starters = useMemo(
    () => (chatConfig.starters ?? []).map((key) => tAny(key)),
    [tAny]
  );

  // In an effect, not in render: `useChat` surfaces the error as
  // state, and setting state while rendering from it is how a render
  // loop starts.
  useEffect(() => {
    if (!error) return;
    const refusal = refusalFrom(error);
    if (refusal) setBlock(refusal);
  }, [error]);

  function friendlyChatError(chatError: Error): string {
    try {
      const parsed = JSON.parse(chatError.message) as { error?: string };
      if (parsed.error) return parsed.error;
    } catch {
      // Not JSON — the transport surfaces the raw response text on a
      // non-JSON error response.
    }
    return chatError.message || t("error.generic");
  }

  function handleSend(text: string) {
    if (!text.trim() || isStreaming || blocked) return;
    void sendMessage({ text });
  }

  // Prefill from `?query=`, once, and only into a conversation that has
  // no messages yet.
  const prefillSent = useRef(false);
  useEffect(() => {
    if (prefillSent.current) return;
    const query = searchParams.get("query");
    if (!query || messages.length > 0) return;
    prefillSent.current = true;
    void sendMessage({ text: query });
  }, [searchParams, messages.length, sendMessage]);

  // Rebuilt each render on purpose: `handleSend` closes over
  // `isStreaming`, and nothing downstream is memoized on this object.
  const toolActions: ToolRendererActions = {
    sendMessage: handleSend,
    addToolResult: (args) => void addToolResult(args),
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList
        messages={messages}
        isStreaming={status === "streaming"}
        starters={starters}
        onStarterSelect={handleSend}
        onRetry={isStreaming ? undefined : () => void regenerate()}
        toolActions={toolActions}
      />
      <CreditStatusBanner quotaState={quotaState} block={block} />
      {error && !block ? (
        <div
          role="alert"
          className="mx-auto mb-2 w-full max-w-3xl rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {friendlyChatError(error)}
        </div>
      ) : null}
      <ChatInput
        onSend={handleSend}
        onStop={stop}
        isStreaming={isStreaming}
        disabled={blocked}
        disabledPlaceholder={t("input.blockedPlaceholder")}
      />
    </div>
  );
}
