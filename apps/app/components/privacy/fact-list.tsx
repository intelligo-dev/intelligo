"use client";

/**
 * Per-category listing of the caller's own facts, with per-fact
 * delete.
 *
 * Categories are core's closed list (`USER_FACT_CATEGORIES`), each
 * named in this item's messages; one the messages lack shows its slug
 * in Title Case. A fact's value shows as itself when it is a string,
 * or as its `label` when it is an object with one.
 *
 * Deletion is optimistic — the row disappears immediately — while the
 * `deleteFact` server action records the deletion in the audit trail
 * and revalidates the page server-side. A deletion the server refuses
 * puts the row back where it was and says why.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteFact } from "@/actions/privacy";
import type { UserFact } from "@intelligo-dev/core/db/schema";

function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function groupByCategory(facts: UserFact[]): Map<string, UserFact[]> {
  const map = new Map<string, UserFact[]>();
  for (const fact of facts) {
    const list = map.get(fact.category) ?? [];
    list.push(fact);
    map.set(fact.category, list);
  }
  return map;
}

function readableValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "label" in value) {
    return String((value as { label: unknown }).label);
  }
  return JSON.stringify(value);
}

export function FactList({ initialFacts }: { initialFacts: UserFact[] }) {
  const t = useTranslations("privacy-settings");
  const categoryLabel = (category: string) => {
    const key = `factList.categories.${category}`;
    return t.has(key) ? t(key) : titleCase(category);
  };
  const [facts, setFacts] = useState(initialFacts);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(groupByCategory(initialFacts).keys())
  );
  const [pending, startTransition] = useTransition();

  const grouped = groupByCategory(facts);

  function handleDelete(factId: string) {
    const index = facts.findIndex((fact) => fact.id === factId);
    const removed = facts[index];
    if (!removed) return;
    setFacts((current) => current.filter((fact) => fact.id !== factId));
    startTransition(async () => {
      const result = await deleteFact(factId).catch(() => null);
      if (result?.success) return;
      setFacts((current) => {
        if (current.some((fact) => fact.id === factId)) return current;
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      });
      toast.error(result?.error ?? t("errors.somethingWentWrong"));
    });
  }

  function toggle(category: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  if (facts.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-6 py-10 text-center">
        <p className="text-sm font-medium">{t("factList.empty")}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("factList.emptyHint")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([category, items]) => {
        const isOpen = expanded.has(category);
        return (
          <div key={category} className="overflow-hidden rounded-lg border">
            <button
              type="button"
              onClick={() => toggle(category)}
              className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50"
            >
              <span className="text-sm font-medium">
                {categoryLabel(category)}{" "}
                <span className="text-muted-foreground">({items.length})</span>
              </span>
              {isOpen ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
            {isOpen && (
              <ul className="divide-y divide-border">
                {items.map((fact) => (
                  <li
                    key={fact.id}
                    className="flex items-start justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{readableValue(fact.value)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("factList.metaLine", {
                          confidence: fact.confidence.toFixed(2),
                          importance: fact.importance,
                        })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => handleDelete(fact.id)}
                      className="size-7 shrink-0 p-0"
                      aria-label={t("factList.deleteAria")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
