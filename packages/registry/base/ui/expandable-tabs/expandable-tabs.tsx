"use client";

/*
 * A bar of icon tabs where the active tab
 * widens to show its label: the label unfurls, the pill glides to it and
 * its panel rises in. import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { motion, useReducedMotion } from "motion/react";

import { EASE_OUT, SPRING_LAYOUT } from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

export interface ExpandableTabsItem {
  id: string;
  /** Shown inside the active tab; always the tab's accessible name. */
  label: string;
  icon: React.ReactNode;
  /** Optional panel shown for this tab. */
  content?: React.ReactNode;
  disabled?: boolean;
}

export interface ExpandableTabsClassNames {
  root?: string;
  list?: string;
  tab?: string;
  pill?: string;
  label?: string;
  panel?: string;
}

export interface ExpandableTabsProps {
  items: ExpandableTabsItem[];
  /** Active tab id; `null` means no tab is open (with `collapsible`). */
  value?: string | null;
  defaultValue?: string | null;
  onValueChange?: (id: string | null) => void;
  /** Pressing the active tab again closes it. */
  collapsible?: boolean;
  /** Accessible name of the tab list. */
  "aria-label"?: string;
  className?: string;
  classNames?: ExpandableTabsClassNames;
}

const LABEL_OPEN = { type: "spring", duration: 0.38, bounce: 0.03 } as const;
const LABEL_CLOSE = { duration: 0.16, ease: EASE_OUT } as const;

export function ExpandableTabs({
  items,
  value: valueProp,
  defaultValue,
  onValueChange,
  collapsible = false,
  "aria-label": ariaLabel = "Tabs",
  className,
  classNames,
}: ExpandableTabsProps) {
  const reduced = useReducedMotion() ?? false;
  const pillId = React.useId();
  const [uncontrolled, setUncontrolled] = React.useState<string | null>(
    defaultValue !== undefined
      ? defaultValue
      : collapsible
        ? null
        : (items[0]?.id ?? null)
  );
  const value = valueProp !== undefined ? valueProp : uncontrolled;

  const setValue = (next: string | null) => {
    if (valueProp === undefined) setUncontrolled(next);
    onValueChange?.(next);
  };

  const active = items.find((item) => item.id === value);
  const hasPanels = items.some((item) => item.content !== undefined);

  return (
    <TabsPrimitive.Root
      data-slot="expandable-tabs"
      value={value}
      onValueChange={(next) => setValue(next as string | null)}
      className={cn(
        "flex flex-col items-center gap-2",
        className,
        classNames?.root
      )}
    >
      {hasPanels
        ? items.map((item) => (
            <TabsPrimitive.Panel
              key={item.id}
              value={item.id}
              className={cn("w-full outline-none", classNames?.panel)}
            >
              <motion.div
                initial={
                  reduced
                    ? { opacity: 0 }
                    : { opacity: 0, y: 6, scale: 0.98, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                transition={
                  reduced ? { duration: 0 } : { duration: 0.28, ease: EASE_OUT }
                }
              >
                {item.content}
              </motion.div>
            </TabsPrimitive.Panel>
          ))
        : null}

      <TabsPrimitive.List
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-card p-1",
          classNames?.list
        )}
      >
        {items.map((item) => {
          const selected = item.id === active?.id;
          return (
            <TabsPrimitive.Tab
              key={item.id}
              value={item.id}
              disabled={item.disabled}
              aria-label={item.label}
              onClick={() => {
                // Base UI ignores a press on the active tab; collapsing is ours.
                if (collapsible && selected) setValue(null);
              }}
              render={
                <motion.button
                  layout={reduced ? false : "position"}
                  transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
                />
              }
              className={cn(
                "relative isolate inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full px-2.5 text-sm font-medium whitespace-nowrap outline-none",
                "text-muted-foreground transition-colors duration-150 hover:text-foreground data-active:text-foreground",
                "focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
                "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                classNames?.tab
              )}
            >
              {selected ? (
                <motion.span
                  aria-hidden
                  layoutId={reduced ? undefined : pillId}
                  transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
                  className={cn(
                    "absolute inset-0 -z-10 rounded-full bg-accent",
                    classNames?.pill
                  )}
                />
              ) : null}
              <span aria-hidden className="grid place-items-center">
                {item.icon}
              </span>
              <motion.span
                aria-hidden
                initial={false}
                animate={
                  reduced
                    ? {
                        width: selected ? "auto" : 0,
                        opacity: selected ? 1 : 0,
                        marginLeft: selected ? 6 : 0,
                      }
                    : {
                        width: selected ? "auto" : 0,
                        opacity: selected ? 1 : 0,
                        marginLeft: selected ? 6 : 0,
                        filter: selected ? "blur(0px)" : "blur(3px)",
                      }
                }
                transition={
                  reduced
                    ? { duration: 0 }
                    : selected
                      ? LABEL_OPEN
                      : LABEL_CLOSE
                }
                className={cn(
                  "inline-block overflow-hidden",
                  classNames?.label
                )}
              >
                {item.label}
              </motion.span>
            </TabsPrimitive.Tab>
          );
        })}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}
