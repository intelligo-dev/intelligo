"use client";

/**
 * The left half of the page's foot: a few conversations to walk back
 * into.
 *
 * Three, not five, and inline rather than a titled list of rows: the
 * sidebar already carries the full history, so a second full list on
 * the home page was the same information twice at twice the weight.
 * What earns its place here is the shortest possible way back into
 * recent work.
 *
 * Timestamps are gone for the same reason — the sidebar groups by day,
 * and a relative time next to every title made three links read as a
 * table. (The `usage` item's table is the right place for the
 * billing-shaped view of the same activity.)
 */

import { MessageSquare } from "lucide-react";
import { useTranslations } from "use-intl";

import { Link } from "@showcase/i18n/navigation";
import { dashboardConfig } from "@showcase/lib/dashboard-config";

export interface RecentConversation {
  id: string;
  title: string | null;
  /** ISO string — server components can't hand a Date to a client one. */
  updatedAt: string;
}

/** How many of the recent conversations the strip shows. */
const SHOWN = 3;

export function RecentConversations({
  conversations,
}: {
  conversations: RecentConversation[];
}) {
  const t = useTranslations("dashboard");

  if (conversations.length === 0) return null;

  const chatBasePath = dashboardConfig.chatBasePath ?? "/chat";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <span className="font-medium uppercase tracking-wide text-muted-foreground">
        {t("recent.title")}
      </span>
      {conversations.slice(0, SHOWN).map((conversation) => (
        <Link
          key={conversation.id}
          href={`${chatBasePath}/${conversation.id}`}
          className="inline-flex max-w-full items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          <MessageSquare className="size-3.5 shrink-0" strokeWidth={2} />
          <span className="truncate">
            {conversation.title ?? t("recent.untitled")}
          </span>
        </Link>
      ))}
    </div>
  );
}
