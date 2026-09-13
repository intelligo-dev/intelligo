"use client";

/**
 * The conversation viewport. shadcn's MessageScroller keeps the newest
 * turn in view while it streams — only when the reader is already at
 * the bottom — and offers a way back down once they scroll up.
 */

import { useTranslations } from "use-intl";
import type { FileUIPart, UIMessage } from "ai";
import { ArrowDownIcon } from "lucide-react";

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@showcase/components/ui/message-scroller";
import type { ToolRendererActions } from "@showcase/lib/chat-renderers";
import { Message, type MessageVersion } from "./message";
import type { MessageVote } from "./message-actions";

interface MessageListProps {
  conversationId: string;
  messages: UIMessage[];
  isStreaming: boolean;
  readOnly?: boolean;
  votes?: Record<string, MessageVote>;
  versionOf?: (messageId: string) => MessageVersion | null;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, text: string, files: FileUIPart[]) => void;
  toolActions?: ToolRendererActions;
  /** Narrower measure for a panel or widget. */
  compact?: boolean;
}

export function MessageList({
  conversationId,
  messages,
  isStreaming,
  readOnly = false,
  votes = {},
  versionOf,
  onRegenerate,
  onEdit,
  toolActions,
  compact = false,
}: MessageListProps) {
  const t = useTranslations("chat");

  return (
    <MessageScrollerProvider>
      <MessageScroller className="min-h-0 flex-1">
        <MessageScrollerViewport>
          <MessageScrollerContent
            className={
              compact
                ? "w-full px-3 py-4"
                : "mx-auto w-full max-w-3xl px-4 py-6"
            }
          >
            {messages.map((message, index) => (
              <MessageScrollerItem key={message.id} messageId={message.id}>
                <Message
                  conversationId={conversationId}
                  message={message}
                  isLastMessage={index === messages.length - 1}
                  isStreaming={isStreaming}
                  readOnly={readOnly}
                  vote={votes[message.id] ?? null}
                  version={versionOf?.(message.id) ?? null}
                  onRegenerate={onRegenerate}
                  onEdit={onEdit}
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
