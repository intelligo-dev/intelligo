"use client";

/**
 * Persistent conversation history beside the chat.
 *
 * The header's dropdown was fine while a workspace had a handful of
 * conversations and stopped being fine somewhere around thirty: no
 * search, no sense of when anything happened, and the current
 * conversation invisible in the list. This puts history where a chat
 * product keeps it — always on screen, grouped by recency, filterable.
 *
 * Below `lg` it is hidden and the header's dropdown takes over: a
 * fixed sidebar on a phone costs more than it returns, and the two
 * controls read the same data, so nothing is lost.
 *
 * Filtering is client-side over what the server already sent. That is
 * honest for the sizes this list actually reaches; a workspace with
 * thousands of conversations wants a server-side search action, and
 * this component's props are shaped so adding one later replaces the
 * filter without touching the layout.
 */

import { useMemo, useState } from "react";
import { MessageSquare, Plus, Search } from "lucide-react";
import { useTranslations } from "use-intl";

import { Link } from "@showcase/i18n/navigation";
import { Button } from "@showcase/components/ui/button";
import { Input } from "@showcase/components/ui/input";
import type { ConversationSummary } from "@showcase/actions/chat";

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  /** The conversation on screen, highlighted and never filtered out. */
  activeId: string;
}

type Bucket = "today" | "week" | "month" | "older";

const BUCKET_ORDER: Bucket[] = ["today", "week", "month", "older"];

function bucketFor(updatedAt: string, now: number): Bucket {
  const ageMs = now - new Date(updatedAt).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (ageMs < day) return "today";
  if (ageMs < 7 * day) return "week";
  if (ageMs < 30 * day) return "month";
  return "older";
}

export function ConversationSidebar({
  conversations,
  activeId,
}: ConversationSidebarProps) {
  const t = useTranslations("chat");
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // `Date.now()` inside the memo, not during render, keeps the
    // bucket boundaries stable for a given filter pass.
    const now = Date.now();

    const matches = conversations.filter((conversation) => {
      if (!needle) return true;
      return (conversation.title ?? "").toLowerCase().includes(needle);
    });

    const buckets = new Map<Bucket, ConversationSummary[]>();
    for (const conversation of matches) {
      const bucket = bucketFor(conversation.updatedAt, now);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), conversation]);
    }
    return buckets;
  }, [conversations, query]);

  const empty = BUCKET_ORDER.every((bucket) => !grouped.get(bucket)?.length);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r lg:flex">
      <div className="space-y-2 border-b p-3">
        <Button asChild size="sm" className="w-full justify-start gap-2">
          <Link href="/chat">
            <Plus className="h-3.5 w-3.5" />
            {t("header.newChat")}
          </Link>
        </Button>

        <div className="relative">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            aria-label={t("sidebar.searchPlaceholder")}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      <nav
        aria-label={t("sidebar.label")}
        className="flex-1 overflow-y-auto px-2 py-3"
      >
        {empty ? (
          <p className="px-2 text-sm text-muted-foreground">
            {query ? t("sidebar.noMatches") : t("header.historyEmpty")}
          </p>
        ) : (
          BUCKET_ORDER.map((bucket) => {
            const items = grouped.get(bucket);
            if (!items?.length) return null;
            return (
              <div key={bucket} className="mb-4">
                <p className="px-2 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`sidebar.groups.${bucket}`)}
                </p>
                <ul>
                  {items.map((conversation) => {
                    const isActive = conversation.id === activeId;
                    return (
                      <li key={conversation.id}>
                        <Link
                          href={`/chat/${conversation.id}`}
                          aria-current={isActive ? "page" : undefined}
                          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                            isActive
                              ? "bg-accent font-medium"
                              : "hover:bg-accent/50"
                          }`}
                          title={
                            conversation.title ?? t("header.historyUntitled")
                          }
                        >
                          <MessageSquare
                            className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                          <span className="truncate">
                            {conversation.title ?? t("header.historyUntitled")}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </nav>

      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        {t("sidebar.count", { count: conversations.length })}
      </p>
    </aside>
  );
}
