"use client";

/**
 * The floating assistant: a launcher in a corner of every page and a
 * compact chat that opens over the page — the same thread the chat
 * page runs, in the widget variant. Mounted once in the app layout;
 * `lib/chat-widget-config.tsx` says where it sits, which agent it
 * runs as, and which routes hide it.
 *
 * Each open conversation is a real one, minted when the widget first
 * opens and kept for the page's lifetime. `body` on the component adds
 * per-page context to every turn; `chatWidgetConfig.body` adds the
 * product's.
 *
 * Installed from the `chat-widget` item; requires the `chat` item.
 */

import { Suspense, useState } from "react";
import { useTranslations } from "use-intl";
import { MessageSquareIcon, XIcon } from "lucide-react";

import { ChatThread } from "@showcase/components/chat/chat-thread";
import { Button } from "@showcase/components/ui/button";
import { usePathname } from "@showcase/i18n/navigation";
import { chatWidgetConfig } from "@showcase/lib/chat-widget-config";
import { cn } from "@showcase/lib/utils";

interface ChatWidgetProps {
  /** Per-page context, merged over `chatWidgetConfig.body`. */
  body?: Record<string, unknown>;
  className?: string;
}

export function ChatWidget({ body, className }: ChatWidgetProps) {
  const t = useTranslations("chat-widget");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [id] = useState(() => crypto.randomUUID());

  const hidden = (chatWidgetConfig.hideOn ?? []).some((prefix) =>
    pathname.startsWith(prefix)
  );
  if (hidden) return null;

  const corner =
    chatWidgetConfig.position === "bottom-left"
      ? "sm:right-auto sm:left-4"
      : "sm:left-auto sm:right-4";
  const name = chatWidgetConfig.agent?.name ?? t("title");

  return (
    <div
      className={cn(
        "fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-3",
        corner,
        className
      )}
    >
      {open ? (
        <section
          role="dialog"
          aria-label={name}
          className="flex h-128 max-h-dvh w-full flex-col overflow-hidden rounded-xl border bg-background shadow-lg sm:w-96"
        >
          <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
              {chatWidgetConfig.agent?.icon ? (
                <span aria-hidden>{chatWidgetConfig.agent.icon}</span>
              ) : null}
              <span className="truncate">{name}</span>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
            >
              <XIcon />
            </Button>
          </header>
          <Suspense fallback={null}>
            <ChatThread
              conversationId={id}
              initialMessages={[]}
              variant="widget"
              agentId={chatWidgetConfig.agent?.id}
              body={{ ...chatWidgetConfig.body, ...body }}
              autoFocus
            />
          </Suspense>
        </section>
      ) : null}
      <Button
        size="lg"
        className="rounded-full shadow-lg"
        aria-expanded={open}
        aria-label={open ? t("close") : t("trigger")}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <XIcon /> : <MessageSquareIcon />}
        <span className={open ? "sr-only" : undefined}>{t("trigger")}</span>
      </Button>
    </div>
  );
}
