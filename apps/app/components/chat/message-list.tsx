"use client";

/**
 * The conversation viewport. A reader-aware scroller follows streamed
 * output at the live edge and lets go the moment the reader scrolls up;
 * on the page it also draws a preview rail for jumping between turns.
 */

import { useTranslations } from "next-intl";
import type { FileUIPart, UIMessage } from "ai";

import { MessageScroller } from "@/components/ui/ai-message-scroller";
import type { ToolRendererActions } from "@/lib/chat-renderers";
import { Message, type MessageVersion } from "./message";
import type { MessageVote } from "./message-actions";

interface MessageListProps {
  conversationId: string;
  messages: UIMessage[];
  isStreaming: boolean;
  /** The runtime's transient status line, shown under the streaming reply. */
  statusLabel?: string | null;
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
  statusLabel = null,
  readOnly = false,
  votes = {},
  versionOf,
  onRegenerate,
  onEdit,
  toolActions,
  compact = false,
}: MessageListProps) {
  const t = useTranslations("chat");
  // Sending brings the reader back to the end, even from far up.
  const lastUserId = messages.findLast((message) => message.role === "user")?.id;

  return (
    <MessageScroller
      className="min-h-0 flex-1"
      busy={isStreaming}
      anchor={lastUserId}
      scrollToEndLabel={t("list.scrollToEnd")}
      label={t("list.label")}
      navigation={compact ? undefined : "rail"}
      navigationLabel={t("list.navigation")}
      navigationItemLabel={(sender, index, total) =>
        t("list.navigationItem", { sender, index, total })
      }
      emptyPreviewLabel={t("list.emptyPreview")}
      contentClassName={
        compact
          ? "flex w-full flex-col gap-4 px-3 py-4"
          : "mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6"
      }
    >
      {messages.map((message, index) => (
        <Message
          key={message.id}
          conversationId={conversationId}
          message={message}
          isLastMessage={index === messages.length - 1}
          isStreaming={isStreaming}
          statusLabel={index === messages.length - 1 ? statusLabel : null}
          readOnly={readOnly}
          vote={votes[message.id] ?? null}
          version={versionOf?.(message.id) ?? null}
          onRegenerate={onRegenerate}
          onEdit={onEdit}
          toolActions={toolActions}
        />
      ))}
    </MessageScroller>
  );
}
