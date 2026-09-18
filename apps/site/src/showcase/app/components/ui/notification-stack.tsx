"use client";

/*
 * Notifications fanned into a stack: the newest card in front, the next
 * ones peeking out below it, scaled back. Hovering or clicking the stack
 * springs the cards apart into a list; each card then opens and dismisses
 * on its own. Fits a notification popover's width.
 */

import * as React from "react";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { BellOffIcon, ChevronDownIcon, XIcon } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "motion/react";

import { EASE_OUT, SPRING_LAYOUT, SwapText } from "@showcase/components/ui/ai-motion";
import { Button } from "@showcase/components/ui/button";
import { cn } from "@showcase/lib/utils";

export interface NotificationStackItem {
  id: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A relative time or date, shown beside the title. */
  time?: React.ReactNode;
  /** An icon or avatar node, shown at the start of the card. */
  icon?: React.ReactNode;
  unread?: boolean;
}

export interface NotificationStackLabels {
  /** The toggle while the stack is folded. */
  expand: string;
  /** The toggle while the stack is fanned out. */
  collapse: string;
  /** Shown in place of the stack when there is nothing to show. */
  empty: string;
  /** Accessible name of each card's dismiss button. */
  dismiss: string;
  /** Accessible name of the list, given the number of notifications. */
  list: (count: number) => string;
  /** Read out beside the unread marker. */
  unread: string;
}

const DEFAULT_LABELS: NotificationStackLabels = {
  expand: "Show all",
  collapse: "Show less",
  empty: "You're all caught up",
  dismiss: "Dismiss notification",
  list: (count) => `${count} ${count === 1 ? "notification" : "notifications"}`,
  unread: "Unread",
};

export interface NotificationStackProps
  extends Omit<React.ComponentProps<"div">, "children"> {
  items: NotificationStackItem[];
  /** Fanned out (controlled). */
  expanded?: boolean;
  defaultExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Called when a card is chosen; without it cards are not interactive. */
  onItemClick?: (item: NotificationStackItem) => void;
  /** Called from a card's dismiss button; without it there is none. */
  onDismiss?: (item: NotificationStackItem) => void;
  /** How many cards show in the folded stack, the front one included. */
  maxVisible?: number;
  /** Fan out while a mouse hovers the stack. */
  expandOnHover?: boolean;
  labels?: Partial<NotificationStackLabels>;
}

/** How far each card behind the front one peeks out, in px. */
const PEEK = 8;
/** How much smaller each card behind the front one is. */
const SCALE_STEP = 0.05;

function useExpanded(
  expanded: boolean | undefined,
  defaultExpanded: boolean,
  onExpandedChange: ((expanded: boolean) => void) | undefined
) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultExpanded);
  const controlled = expanded !== undefined;
  const setExpanded = React.useCallback(
    (next: boolean) => {
      if (!controlled) setUncontrolled(next);
      onExpandedChange?.(next);
    },
    [controlled, onExpandedChange]
  );
  return [controlled ? expanded : uncontrolled, setExpanded] as const;
}

function NotificationCardBody({
  item,
  labels,
}: {
  item: NotificationStackItem;
  labels: NotificationStackLabels;
}) {
  return (
    <>
      {item.icon ? (
        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-full bg-muted text-muted-foreground [&_svg:not([class*='size-'])]:size-4">
          {item.icon}
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm leading-5 text-foreground",
              item.unread ? "font-semibold" : "font-medium"
            )}
          >
            {item.title}
          </span>
          {item.time ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {item.time}
            </span>
          ) : null}
        </span>
        {item.description ? (
          <span className="line-clamp-2 text-xs leading-4 text-muted-foreground">
            {item.description}
          </span>
        ) : null}
      </span>
      {item.unread ? (
        <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary">
          <span className="sr-only">{labels.unread}</span>
        </span>
      ) : null}
    </>
  );
}

function NotificationStack({
  items,
  expanded: expandedProp,
  defaultExpanded = false,
  onExpandedChange,
  onItemClick,
  onDismiss,
  maxVisible = 3,
  expandOnHover = true,
  labels: labelOverrides,
  className,
  onPointerEnter,
  onPointerLeave,
  ...props
}: NotificationStackProps) {
  const reduced = useReducedMotion() ?? false;
  const labels = React.useMemo(
    () => ({ ...DEFAULT_LABELS, ...labelOverrides }),
    [labelOverrides]
  );
  const listId = React.useId();
  const rootRef = React.useRef<HTMLDivElement>(null);
  // Set when a hovering mouse fanned the stack out: only then does the
  // mouse leaving fold it back. A click that opened it keeps it open.
  const openedByHover = React.useRef(false);
  const [expanded, setExpanded] = useExpanded(
    expandedProp,
    defaultExpanded,
    onExpandedChange
  );

  const canStack = items.length > 1;
  const stacked = canStack && !expanded;
  const peeking = Math.min(items.length, Math.max(1, maxVisible)) - 1;

  const cardTransition: Transition = reduced
    ? { duration: 0 }
    : { ...SPRING_LAYOUT, opacity: { duration: 0.2, ease: EASE_OUT } };

  if (items.length === 0) {
    return (
      <div
        data-slot="notification-stack"
        className={cn(
          "flex w-full items-center justify-center gap-2 rounded-lg bg-muted px-4 py-8 text-sm font-medium text-muted-foreground",
          className
        )}
        {...props}
      >
        <BellOffIcon className="size-4" aria-hidden />
        {labels.empty}
      </div>
    );
  }

  const toggle = () => {
    openedByHover.current = false;
    setExpanded(!expanded);
  };

  return (
    <div
      ref={rootRef}
      data-slot="notification-stack"
      data-state={stacked ? "stacked" : "expanded"}
      className={cn("flex w-full flex-col gap-1.5", className)}
      onPointerEnter={(event) => {
        onPointerEnter?.(event);
        if (!expandOnHover || event.pointerType !== "mouse") return;
        if (stacked) {
          openedByHover.current = true;
          setExpanded(true);
        }
      }}
      onPointerLeave={(event) => {
        onPointerLeave?.(event);
        if (event.pointerType !== "mouse" || !openedByHover.current) return;
        // Keyboard focus inside the list keeps it open.
        if (rootRef.current?.contains(document.activeElement)) return;
        openedByHover.current = false;
        setExpanded(false);
      }}
      {...props}
    >
      <motion.ul
        id={listId}
        aria-label={labels.list(items.length)}
        initial={false}
        animate={{ marginBottom: stacked ? peeking * PEEK : 0 }}
        transition={cardTransition}
        // Folded, the whole stack is one target that fans it out; the
        // toggle below is its keyboard and screen-reader route.
        onClick={stacked ? () => setExpanded(true) : undefined}
        className={cn(
          "relative flex flex-col gap-2",
          stacked && "cursor-pointer"
        )}
      >
        <AnimatePresence initial={false}>
          {items.map((item, index) => {
            const behind = stacked && index > 0;
            const depth = stacked ? Math.min(index, peeking) : 0;
            const hidden = stacked && index > peeking;
            const interactive = !stacked;

            return (
              <motion.li
                key={item.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                animate={{
                  opacity: hidden ? 0 : 1,
                  y: depth * PEEK,
                  scale: 1 - depth * SCALE_STEP,
                }}
                exit={
                  reduced
                    ? { opacity: 0, transition: { duration: 0 } }
                    : {
                        opacity: 0,
                        x: 24,
                        transition: { duration: 0.16, ease: EASE_OUT },
                      }
                }
                transition={cardTransition}
                inert={behind}
                aria-hidden={behind || undefined}
                data-unread={item.unread || undefined}
                className={cn(
                  "group/notification relative flex overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-xs",
                  behind && "absolute inset-0"
                )}
                style={{
                  zIndex: items.length - index,
                  transformOrigin: "bottom center",
                }}
              >
                <div
                  className={cn(
                    "flex min-w-0 flex-1",
                    behind && "invisible"
                  )}
                >
                  {interactive && onItemClick ? (
                    <ButtonPrimitive
                      className="flex min-w-0 flex-1 items-start gap-3 rounded-xl p-3 text-left outline-none transition-colors duration-fast hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      onClick={() => onItemClick(item)}
                    >
                      <NotificationCardBody item={item} labels={labels} />
                    </ButtonPrimitive>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-start gap-3 p-3">
                      <NotificationCardBody item={item} labels={labels} />
                    </div>
                  )}
                  {interactive && onDismiss ? (
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={labels.dismiss}
                      className="absolute top-2 right-2 bg-card opacity-0 group-focus-within/notification:opacity-100 group-hover/notification:opacity-100 pointer-coarse:opacity-100"
                      onClick={() => onDismiss(item)}
                    >
                      <XIcon />
                    </Button>
                  ) : null}
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </motion.ul>

      {canStack ? (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={!stacked}
          aria-controls={listId}
          onClick={toggle}
          className="self-start"
        >
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums">
            {items.length}
          </span>
          <SwapText value={stacked ? "expand" : "collapse"}>
            {stacked ? labels.expand : labels.collapse}
          </SwapText>
          <motion.span
            aria-hidden
            className="inline-flex"
            initial={false}
            animate={{ rotate: stacked ? 0 : 180 }}
            transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
          >
            <ChevronDownIcon className="size-3.5" />
          </motion.span>
        </Button>
      ) : null}
    </div>
  );
}

export { NotificationStack };
