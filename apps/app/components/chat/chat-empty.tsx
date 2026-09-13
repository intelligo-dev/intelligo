"use client";

/**
 * An empty conversation, the way a chat product opens: the greeting
 * and the composer in the middle of the page, starters beneath. The
 * composer docks to the bottom the moment the first message is sent —
 * the thread renders this only while there is nothing to scroll.
 */

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Suggestion } from "@/components/ui/ai-suggestion";

interface ChatEmptyProps {
  starters: string[];
  onStarterSelect: (text: string) => void;
  /** The composer, rendered in the centre of the page. */
  composer: ReactNode;
  /** A compact layout for a panel or widget: no greeting, starters as a list. */
  compact?: boolean;
}

export function ChatEmpty({
  starters,
  onStarterSelect,
  composer,
  compact = false,
}: ChatEmptyProps) {
  const t = useTranslations("chat");

  if (compact) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-3 p-3">
        <p className="text-sm text-muted-foreground">
          {t("emptyState.description")}
        </p>
        {starters.length > 0 ? (
          <div className="flex flex-col items-start gap-1.5">
            {starters.map((starter, index) => (
              <Suggestion
                key={index}
                suggestion={starter}
                onClick={onStarterSelect}
                className="h-auto max-w-full justify-start py-1.5 text-left whitespace-normal"
              />
            ))}
          </div>
        ) : null}
        {composer}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-4 py-8">
      <h2 className="text-center text-2xl font-semibold tracking-tight">
        {t("emptyState.greeting")}
      </h2>
      <div className="w-full">{composer}</div>
      {starters.length > 0 ? (
        <div className="flex max-w-2xl flex-wrap justify-center gap-2">
          {starters.map((starter, index) => (
            <Suggestion
              key={index}
              suggestion={starter}
              onClick={onStarterSelect}
              className="h-auto py-1.5 text-left whitespace-normal"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
