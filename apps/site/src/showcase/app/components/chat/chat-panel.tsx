"use client";

/**
 * The chat as a side panel on any page — a sheet with the same thread
 * the chat page runs, opened from wherever the product puts the
 * trigger: a header button, a "help" affordance, a row's context menu.
 *
 * Each open conversation is a real one: a fresh id is minted when the
 * panel first opens (the row appears on the first message, like the
 * page) and kept for the page's lifetime, so closing and reopening the
 * panel continues the same thread. Pass `conversationId` to pin it to
 * an existing conversation instead, and `body` to give the agent the
 * page's context on every turn (`resolveAgent` reads it).
 *
 * Installed from the `chat-panel` item; requires the `chat` item.
 */

import { Suspense, useState, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { MessageSquareIcon } from "lucide-react";

import { ChatThread } from "@showcase/components/chat/chat-thread";
import { Button } from "@showcase/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@showcase/components/ui/sheet";
import { cn } from "@showcase/lib/utils";

interface ChatPanelProps {
  /** The trigger; a button with the item's own label when omitted. */
  trigger?: ReactNode;
  /** Continue an existing conversation rather than starting one. */
  conversationId?: string;
  /** Overrides the agent the chat surface is configured with. */
  agentId?: string;
  /** Sent with every turn — the page the reader is on, the record they are looking at. */
  body?: Record<string, unknown>;
  title?: string;
  description?: string;
  side?: "right" | "left";
  className?: string;
}

export function ChatPanel({
  trigger,
  conversationId,
  agentId,
  body,
  title,
  description,
  side = "right",
  className,
}: ChatPanelProps) {
  const t = useTranslations("chat-panel");
  const [open, setOpen] = useState(false);
  const [id] = useState(() => conversationId ?? crypto.randomUUID());

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          trigger ? (
            <span className="contents" />
          ) : (
            <Button variant="outline" size="sm" />
          )
        }
        nativeButton={!trigger}
      >
        {trigger ?? (
          <>
            <MessageSquareIcon data-icon="inline-start" />
            {t("trigger")}
          </>
        )}
      </SheetTrigger>
      <SheetContent
        side={side}
        className={cn("flex w-full flex-col gap-0 p-0 sm:max-w-md", className)}
      >
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>{title ?? t("title")}</SheetTitle>
          <SheetDescription className={description ? undefined : "sr-only"}>
            {description ?? t("description")}
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <Suspense fallback={null}>
            <ChatThread
              conversationId={id}
              initialMessages={[]}
              variant="panel"
              agentId={agentId}
              body={body}
              autoFocus
            />
          </Suspense>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
