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
import {
  CreditStatusBanner,
  type ChatBlock,
  type ChatQuotaState,
} from "./credit-status-banner";
import { parseChatError } from "@intelligo-dev/chat/client";

import { chatConfig } from "@/lib/chat-config";
import type { ToolRendererActions } from "@/lib/chat-renderers";

/**
 * A refusal that blocks the composer, or nothing. Admission answers 402
 * with the entitlement port's own code (`insufficient_credits`,
 * `allowance_depleted`…), which is what the banner keys its copy on; a
 * feature gate is a block too. Anything else — a rate limit, a stream
 * failure — is transient and belongs in the error strip.
 *
 * At module scope so the effect that reads it has a stable reference
 * and needs no dependency entry.
 */
function refusalFrom(chatError: Error): ChatBlock | null {
  const parsed = parseChatError(chatError);
  if (!parsed) return null;
  if (
    parsed.code !== "QUOTA_EXCEEDED" &&
    parsed.code !== "BILLING_NOT_CONFIGURED" &&
    parsed.code !== "FEATURE_GATED"
  ) {
    return null;
  }
  return { code: parsed.reasonCode ?? parsed.code, message: parsed.error };
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
        // The agent identity travels with the turn so a deployment that
        // resolves agents per conversation (`resolveAgent` in
        // `lib/chat-server-config.ts`) knows which one this surface is.
        body: {
          id: conversationId,
          ...(chatConfig.agent?.id ? { agentId: chatConfig.agent.id } : {}),
        },
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
    // A non-JSON error response (a proxy's page, a network failure)
    // surfaces as raw text; the generic copy beats showing it.
    return parseChatError(chatError)?.error ?? t("error.generic");
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
