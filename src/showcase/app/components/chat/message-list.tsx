"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "use-intl";
import type { UIMessage } from "ai";

import { Button } from "@showcase/components/ui/button";
import type { ToolRendererActions } from "@showcase/lib/chat-renderers";
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, isStreaming]);

  if (messages.length === 0) {
    return <EmptyState starters={starters} onStarterSelect={onStarterSelect} />;
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {messages.map((message, index) => (
          <Message
            key={message.id}
            message={message}
            isLastMessage={index === messages.length - 1}
            isStreaming={isStreaming}
            onRetry={onRetry}
            toolActions={toolActions}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
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
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("emptyState.title")}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          {t("emptyState.description")}
        </p>
      </div>
      {starters && starters.length > 0 ? (
        <div className="flex max-w-2xl flex-wrap justify-center gap-2">
          {starters.map((starter, index) => (
            <Button
              key={index}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto whitespace-normal rounded-full px-4 py-2 text-left text-sm"
              onClick={() => onStarterSelect?.(starter)}
            >
              {starter}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
