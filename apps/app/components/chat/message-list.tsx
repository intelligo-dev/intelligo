"use client";

/**
 * The conversation viewport. shadcn's MessageScroller keeps the newest
 * turn in view while it streams and offers a way back down once the
 * reader scrolls up; an empty conversation shows its starters instead.
 */

import { useTranslations } from "next-intl";
import type { UIMessage } from "ai";
import { ArrowDownIcon, MessageSquareIcon } from "lucide-react";

import { Suggestion } from "@/components/ui/ai-suggestion";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import type { ToolRendererActions } from "@/lib/chat-renderers";
import { Message } from "./message";

interface MessageListProps {
  messages: UIMessage[];
  isStreaming: boolean;
  /** Resolved starter prompt text — see `@/lib/chat-config`. */
  starters?: string[];
  /** Called with a starter's text when the caller picks one. */
  onStarterSelect?: (text: string) => void;
  /** Regenerate the last assistant reply; omit to hide the control. */
  onRetry?: () => void;
  /** Passed to interactive tool renderers — see `@/lib/chat-renderers`. */
  toolActions?: ToolRendererActions;
}

export function MessageList({
  messages,
  isStreaming,
  starters,
  onStarterSelect,
  onRetry,
  toolActions,
}: MessageListProps) {
  const t = useTranslations("chat");

  if (messages.length === 0) {
    return <EmptyState starters={starters} onStarterSelect={onStarterSelect} />;
  }

  return (
    <MessageScrollerProvider>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((message, index) => (
              <MessageScrollerItem key={message.id} messageId={message.id}>
                <Message
                  message={message}
                  isLastMessage={index === messages.length - 1}
                  isStreaming={isStreaming}
                  onRetry={onRetry}
                  toolActions={toolActions}
                />
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton>
          <ArrowDownIcon />
          <span className="sr-only">{t("list.scrollToEnd")}</span>
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  );
}

function EmptyState({
  starters,
  onStarterSelect,
}: {
  starters?: string[];
  onStarterSelect?: (text: string) => void;
}) {
  const t = useTranslations("chat");

  return (
    <Empty className="flex-1">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MessageSquareIcon />
        </EmptyMedia>
        <EmptyTitle>{t("emptyState.title")}</EmptyTitle>
        <EmptyDescription>{t("emptyState.description")}</EmptyDescription>
      </EmptyHeader>
      {starters && starters.length > 0 ? (
        <EmptyContent className="max-w-2xl flex-row flex-wrap justify-center">
          {starters.map((starter, index) => (
            <Suggestion
              key={index}
              suggestion={starter}
              onClick={onStarterSelect}
              className="h-auto py-1.5 text-left whitespace-normal"
            />
          ))}
        </EmptyContent>
      ) : null}
    </Empty>
  );
}
