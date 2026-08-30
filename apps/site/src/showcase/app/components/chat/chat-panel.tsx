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

import { useEffect, useMemo, useRef } from "react";
import { useTranslations } from "use-intl";
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useSearchParams } from "@showcase/shims/next-navigation";

import { ChatInput } from "./chat-input";
import { MessageList } from "./message-list";
import { chatConfig } from "@showcase/lib/chat-config";
import type { ToolRendererActions } from "@showcase/lib/chat-renderers";

interface ChatProps {
  conversationId: string;
  initialMessages: UIMessage[];
}

export function Chat({ conversationId, initialMessages }: ChatProps) {
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

  const starters = useMemo(
    () => (chatConfig.starters ?? []).map((key) => tAny(key)),
    [tAny]
  );

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
    if (!text.trim() || isStreaming) return;
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
      {error ? (
        <div
          role="alert"
          className="mx-auto mb-2 w-full max-w-3xl rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {friendlyChatError(error)}
        </div>
      ) : null}
      <ChatInput onSend={handleSend} onStop={stop} isStreaming={isStreaming} />
    </div>
  );
}
