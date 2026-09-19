"use client";

/**
 * A shared conversation, read-only: the same message component the
 * chat page renders, with no composer, no actions and no edit. The
 * banner says what this is and offers the product.
 */

import { useTranslations } from "use-intl";
import type { UIMessage } from "ai";

import { MessageList } from "@showcase/components/chat/message-list";
import { Button } from "@showcase/components/ui/button";
import { Link } from "@showcase/i18n/navigation";

interface SharedConversationProps {
  conversationId: string;
  title: string | null;
  messages: UIMessage[];
}

export function SharedConversation({
  conversationId,
  title,
  messages,
}: SharedConversationProps) {
  const t = useTranslations("chat-share");

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{t("readOnly")}</p>
          <h1 className="truncate text-sm font-medium">
            {title ?? t("untitled")}
          </h1>
        </div>
        <Button size="sm" render={<Link href="/chat" />} nativeButton={false}>
          {t("openApp")}
        </Button>
      </header>
      <MessageList
        conversationId={conversationId}
        messages={messages}
        isStreaming={false}
        readOnly
      />
    </div>
  );
}
