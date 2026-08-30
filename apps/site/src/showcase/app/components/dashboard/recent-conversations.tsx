"use client";

/**
 * The five most recent conversations, as frameless rows.
 *
 * This is what "recent work" means on an AI product's home page —
 * conversations you can walk back into, not execution records. (The
 * `usage` item's table is the right place for the billing-shaped view
 * of the same activity.)
 *
 * Timestamps render as an absolute date on the server and swap to
 * relative once mounted, since `Date.now()` during render would differ
 * between server and client.
 */

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { useFormatter, useTranslations } from "use-intl";

import { Link } from "@showcase/i18n/navigation";
import { dashboardConfig } from "@showcase/lib/dashboard-config";

export interface RecentConversation {
  id: string;
  title: string | null;
  /** ISO string — server components can't hand a Date to a client one. */
  updatedAt: string;
}

export function RecentConversations({
  conversations,
}: {
  conversations: RecentConversation[];
}) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  if (conversations.length === 0) return null;

  const chatBasePath = dashboardConfig.chatBasePath ?? "/chat";

  return (
    <div className="mx-auto mt-12 w-full max-w-2xl">
      <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("recent.title")}
      </p>
      <ul className="mt-2">
        {conversations.map((conversation) => {
          const updated = new Date(conversation.updatedAt);
          return (
            <li key={conversation.id}>
              <Link
                href={`${chatBasePath}/${conversation.id}`}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent/40"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  <MessageSquare className="size-3.5" strokeWidth={2} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {conversation.title ?? t("recent.untitled")}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {now
                    ? format.relativeTime(updated, now)
                    : format.dateTime(updated, { dateStyle: "medium" })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
