"use client";

/**
 * Renders one `UIMessage`'s parts. Text uses `streamdown` (the same
 * markdown-while-streaming renderer the dissolving `@intelligo-dev/chat`
 * package used) rather than a plain `<pre>` — chat replies are
 * routinely lists, code blocks and headings, and re-parsing a partial
 * markdown document on every token is exactly the incremental-parsing
 * problem that package exists to solve. Tool parts are handed to
 * `@/lib/chat-renderers`'s seam; reasoning parts get a plain
 * collapsible `<details>` (no product ships a "thinking" design by
 * default, so this stays undecorated on purpose).
 *
 * A finished assistant message carries an action row — copy the reply,
 * regenerate it (last message only), and save it as an artifact so the
 * `artifacts` item's page has something to show. The row is hidden
 * while that message is still streaming.
 */

import { useState, useTransition } from "react";
import { getToolName, isReasoningUIPart, isTextUIPart, isToolUIPart } from "ai";
import type { UIMessage } from "ai";
import { useTranslations } from "next-intl";
import { Bot, Check, Copy, FileDown, RefreshCw, User } from "lucide-react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
    <div className={cn("group flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div
        className={cn(
          "min-w-0 flex-1 space-y-2",
          isUser && "flex flex-col items-end"
        )}
      >
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;

          if (isTextUIPart(part)) {
            if (!part.text) return null;
            return isUser ? (
              <div
                key={key}
                className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground"
              >
                {part.text}
              </div>
            ) : (
              <div
                key={key}
                className="max-w-[85%] text-sm leading-relaxed [&_pre]:overflow-x-auto"
              >
                <Streamdown>{part.text}</Streamdown>
              </div>
            );
          }

          if (isReasoningUIPart(part)) {
            if (!part.text) return null;
            return (
              <details
                key={key}
                className="max-w-[85%] rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              >
                <summary className="cursor-pointer select-none">
                  {t("message.reasoning")}
                </summary>
                <div className="mt-2 whitespace-pre-wrap">{part.text}</div>
              </details>
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
          <span
            className="inline-block h-4 w-1.5 animate-pulse rounded-full bg-muted-foreground/50"
            aria-hidden
          />
        ) : null}

        {showActions ? (
          <MessageActions
            text={text}
            messageId={message.id}
            onRetry={isLastMessage ? onRetry : undefined}
          />
        ) : null}
      </div>
    </div>
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
  const [copied, setCopied] = useState(false);
  const [isSaving, startSaving] = useTransition();

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("actions.copyFailed"));
    }
  }

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
    <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        {copied ? t("actions.copied") : t("actions.copy")}
      </Button>

      {onRetry ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t("actions.retry")}
        </Button>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
        onClick={handleSave}
        disabled={isSaving}
      >
        <FileDown className="h-3.5 w-3.5" />
        {t("actions.save")}
      </Button>
    </div>
  );
}
