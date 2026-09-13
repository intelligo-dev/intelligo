"use client";

/**
 * Renders one `UIMessage`'s parts on the design system's conversation
 * components (ADR-0013): shadcn's Message and Bubble for the turn, the
 * T3 Reasoning part for reasoning, and `@/lib/chat-renderers`'s seam for
 * tool calls. Text renders with `streamdown`, the markdown-while-
 * streaming renderer, because replies are routinely lists, code and
 * headings arriving a token at a time.
 *
 * A finished assistant message carries an action row — copy the reply,
 * regenerate it (last message only), and save it as an artifact so the
 * `artifacts` item's page has something to show. The row is hidden
 * while that message is still streaming.
 */

import { useTransition } from "react";
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { BotIcon, FileDownIcon, RefreshCwIcon, UserIcon } from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ui/ai-reasoning";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import {
  MessageAvatar,
  MessageContent,
  MessageFooter,
  Message as MessageRoot,
} from "@/components/ui/message";
import { Spinner } from "@/components/ui/spinner";
import {
  getToolRenderer,
  type ToolRendererActions,
} from "@/lib/chat-renderers";
import { saveMessageAsArtifact } from "@/actions/chat";

interface MessageProps {
  message: UIMessage;
  isLastMessage: boolean;
  isStreaming: boolean;
  /** Regenerate the last assistant reply; omit to hide the control. */
  onRetry?: () => void;
  toolActions?: ToolRendererActions;
}

/** The message's plain text, for copying and for artifact content. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n")
    .trim();
}

export function Message({
  message,
  isLastMessage,
  isStreaming,
  onRetry,
  toolActions,
}: MessageProps) {
  const t = useTranslations("chat");
  const isUser = message.role === "user";
  const isEmptyAssistant =
    !isUser && message.parts.every((part) => !isTextUIPart(part) || !part.text);
  const isStreamingThis = isLastMessage && isStreaming;
  const text = messageText(message);
  const showActions = !isUser && !isStreamingThis && text.length > 0;

  return (
    <MessageRoot
      align={isUser ? "end" : "start"}
      className="group/chat-message"
    >
      <MessageAvatar>{isUser ? <UserIcon /> : <BotIcon />}</MessageAvatar>

      <MessageContent>
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;

          if (isTextUIPart(part)) {
            if (!part.text) return null;
            return isUser ? (
              <Bubble key={key} align="end">
                <BubbleContent className="whitespace-pre-wrap">
                  {part.text}
                </BubbleContent>
              </Bubble>
            ) : (
              <Bubble key={key} variant="ghost">
                <BubbleContent>
                  <Streamdown>{part.text}</Streamdown>
                </BubbleContent>
              </Bubble>
            );
          }

          if (isReasoningUIPart(part)) {
            if (!part.text) return null;
            const reasoningStreaming =
              isStreamingThis && index === message.parts.length - 1;
            return (
              <Reasoning key={key} isStreaming={reasoningStreaming}>
                <ReasoningTrigger
                  getThinkingMessage={(streaming, duration) =>
                    streaming
                      ? t("message.thinking")
                      : duration === undefined
                        ? t("message.thoughtBriefly")
                        : t("message.thoughtFor", { seconds: duration })
                  }
                />
                <ReasoningContent>{part.text}</ReasoningContent>
              </Reasoning>
            );
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part);
            const Renderer = getToolRenderer(toolName);
            const state = part.state;
            return (
              <Renderer
                key={key}
                toolName={toolName}
                state={state}
                input={"input" in part ? part.input : undefined}
                output={state === "output-available" ? part.output : undefined}
                errorText={
                  state === "output-error" ? part.errorText : undefined
                }
                toolCallId={"toolCallId" in part ? part.toolCallId : undefined}
                actions={toolActions}
              />
            );
          }

          return null;
        })}

        {isStreamingThis && isEmptyAssistant ? (
          <span role="status" className="shimmer text-sm text-muted-foreground">
            {t("message.thinking")}
          </span>
        ) : null}

        {showActions ? (
          <MessageFooter>
            <MessageActions
              text={text}
              messageId={message.id}
              onRetry={isLastMessage ? onRetry : undefined}
            />
          </MessageFooter>
        ) : null}
      </MessageContent>
    </MessageRoot>
  );
}

function MessageActions({
  text,
  messageId,
  onRetry,
}: {
  text: string;
  messageId: string;
  onRetry?: () => void;
}) {
  const t = useTranslations("chat");
  const [isSaving, startSaving] = useTransition();

  function handleSave() {
    startSaving(async () => {
      const result = await saveMessageAsArtifact({ messageId, content: text });
      if (result.success) {
        toast.success(t("actions.savedToArtifacts"));
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/chat-message:opacity-100 focus-within:opacity-100">
      <CopyButton
        value={text}
        label={t("actions.copy")}
        copiedLabel={t("actions.copied")}
        onCopyError={() => toast.error(t("actions.copyFailed"))}
        size="xs"
        className="text-muted-foreground"
      >
        {t("actions.copy")}
      </CopyButton>

      {onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="text-muted-foreground"
          onClick={onRetry}
        >
          <RefreshCwIcon data-icon="inline-start" />
          {t("actions.retry")}
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="text-muted-foreground"
        onClick={handleSave}
        disabled={isSaving}
        aria-busy={isSaving || undefined}
      >
        {isSaving ? (
          <Spinner data-icon="inline-start" />
        ) : (
          <FileDownIcon data-icon="inline-start" />
        )}
        {t("actions.save")}
      </Button>
    </div>
  );
}
