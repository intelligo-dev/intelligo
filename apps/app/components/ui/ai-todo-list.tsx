"use client";

/*
 * The agent's to-do list: a
 * collapsible plan whose status marks morph between pending, in
 * progress, completed and cancelled, with a rolling completion count in
 * the header. import * as React from "react";
import { ChevronDownIcon, ListTodoIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  Disclosure,
  EASE_OUT,
  SPRING_LAYOUT,
  SPRING_SWAP,
  SwapText,
} from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

export type TodoItemStatus =
  | "pending"
  | "in-progress"
  | "completed"
  | "cancelled";

export interface TodoItem {
  id: string;
  title: React.ReactNode;
  status?: TodoItemStatus;
  /** 0–100. Omitted while in progress = an indeterminate spinning arc. */
  progress?: number;
  detail?: React.ReactNode;
}

export interface TodoListProps extends Omit<
  React.ComponentProps<"section">,
  "title"
> {
  items: TodoItem[];
  title?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Fold the list when every item completes; reopen if one reverts. */
  collapseOnComplete?: boolean;
  /** Viewport height in px before the list scrolls. */
  maxHeight?: number;
  /** Accessible name of the whole list. */
  label?: string;
  emptyLabel?: string;
  /** Spoken before each item's title. */
  statusLabels?: Partial<Record<TodoItemStatus, string>>;
  /** The sr-only completion count in the header. */
  completedLabel?: (done: number, total: number) => string;
}

const DEFAULT_STATUS_LABELS: Record<TodoItemStatus, string> = {
  pending: "Pending",
  "in-progress": "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

function defaultCompletedLabel(done: number, total: number) {
  return `${done} of ${total} tasks completed`;
}

function TodoHeaderIcon({ complete }: { complete: boolean }) {
  const reduce = useReducedMotion() ?? false;

  return (
    <span
      data-slot="todo-list-header-icon"
      aria-hidden="true"
      className="relative grid size-6 shrink-0 place-items-center"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {complete ? (
          <motion.svg
            key="complete"
            viewBox="0 0 24 24"
            initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.72 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="absolute size-5.5 overflow-visible text-success"
          >
            <circle cx="12" cy="12" r="9" fill="currentColor" />
            <motion.path
              d="M7.5 12.25 10.5 15.25 16.75 8.75"
              fill="none"
              stroke="var(--background)"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduce ? { pathLength: 1 } : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={
                reduce ? { duration: 0 } : { duration: 0.24, ease: EASE_OUT }
              }
            />
          </motion.svg>
        ) : (
          <motion.span
            key="todo"
            initial={reduce ? { opacity: 1 } : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.72 }}
            transition={reduce ? { duration: 0 } : SPRING_SWAP}
            className="absolute grid place-items-center text-muted-foreground"
          >
            <ListTodoIcon className="size-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/**
 * One SVG whose parts fade and draw between states, so a status change
 * morphs instead of swapping icons: a dashed ring while pending, a
 * progress arc (or a spinning one) while in progress, a drawn check
 * when completed, a drawn cross when cancelled.
 */
function TodoStatusIcon({
  status,
  progress,
}: {
  status: TodoItemStatus;
  progress?: number;
}) {
  const reduce = useReducedMotion() ?? false;
  const normalizedProgress =
    progress === undefined ? 0.68 : Math.min(100, Math.max(0, progress)) / 100;
  const indeterminate =
    status === "in-progress" && progress === undefined && !reduce;

  return (
    <motion.svg
      data-slot="todo-list-status-icon"
      aria-hidden="true"
      viewBox="0 0 24 24"
      initial={false}
      className={cn(
        "mx-0.5 size-5 shrink-0 overflow-visible text-muted-foreground",
        status === "in-progress" && "text-foreground",
        status === "cancelled" && "text-destructive"
      )}
    >
      <motion.circle
        cx="12"
        cy="12"
        r="9"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={status === "pending" ? "2 3" : undefined}
        strokeLinecap="round"
        initial={false}
        animate={{ fillOpacity: status === "completed" ? 0.06 : 0 }}
        transition={
          reduce ? { duration: 0 } : { duration: 0.18, ease: EASE_OUT }
        }
        className={cn(status === "in-progress" && "opacity-20")}
      />
      <motion.circle
        cx="12"
        cy="12"
        r="9"
        pathLength="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: status === "in-progress" ? normalizedProgress : 0,
          opacity: status === "in-progress" ? 1 : 0,
          rotate: indeterminate ? 360 : -90,
        }}
        transition={
          indeterminate
            ? { rotate: { duration: 1.1, repeat: Infinity, ease: "linear" } }
            : reduce
              ? { duration: 0 }
              : SPRING_LAYOUT
        }
        style={{ transformOrigin: "12px 12px" }}
      />
      <motion.path
        d="M7.5 12.25 10.5 15.25 16.75 8.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{
          pathLength: status === "completed" ? 1 : 0,
          opacity: status === "completed" ? 1 : 0,
        }}
        transition={
          reduce ? { duration: 0 } : { duration: 0.24, ease: EASE_OUT }
        }
      />
      <motion.path
        d="M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        initial={false}
        animate={{
          pathLength: status === "cancelled" ? 1 : 0,
          opacity: status === "cancelled" ? 1 : 0,
        }}
        transition={
          reduce ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }
        }
      />
    </motion.svg>
  );
}

function TodoList({
  items,
  title = "To-dos",
  open,
  defaultOpen = true,
  onOpenChange,
  collapseOnComplete = true,
  maxHeight = 248,
  label = "Agent task list",
  emptyLabel = "No tasks yet",
  statusLabels,
  completedLabel = defaultCompletedLabel,
  className,
  ...props
}: TodoListProps) {
  const reduce = useReducedMotion() ?? false;
  const baseId = React.useId();
  const triggerId = `${baseId}-trigger`;
  const contentId = `${baseId}-content`;
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const previousComplete = React.useRef(false);
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const currentOpen = open ?? internalOpen;
  const completed = items.filter((item) => item.status === "completed").length;
  const allComplete = items.length > 0 && completed === items.length;
  const itemCount = items.length;
  const labels = { ...DEFAULT_STATUS_LABELS, ...statusLabels };

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange, open]
  );

  // Fold once everything is done; unfold again if a task comes back.
  React.useEffect(() => {
    if (previousComplete.current && !allComplete) {
      setOpen(true);
    }
    if (!previousComplete.current && allComplete && collapseOnComplete) {
      setOpen(false);
    }
    previousComplete.current = allComplete;
  }, [allComplete, collapseOnComplete, setOpen]);

  // A new item scrolls into view when the list is taller than the viewport.
  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || itemCount === 0) return;

    const frame = requestAnimationFrame(() => {
      if (viewport.scrollHeight <= viewport.clientHeight) return;
      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({
          top: viewport.scrollHeight,
          behavior: reduce ? "auto" : "smooth",
        });
      } else {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [itemCount, reduce]);

  return (
    <section
      data-slot="todo-list"
      data-state={currentOpen ? "open" : "closed"}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-2xl border border-border/70",
        className
      )}
      {...props}
    >
      <button
        data-slot="todo-list-trigger"
        id={triggerId}
        type="button"
        aria-expanded={currentOpen}
        aria-controls={contentId}
        onClick={() => setOpen(!currentOpen)}
        className="group flex h-11 w-full items-center gap-2.5 rounded-2xl px-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <TodoHeaderIcon complete={allComplete} />
        <h3
          data-slot="todo-list-title"
          className="min-w-0 flex-1 truncate text-sm font-medium text-foreground/90"
        >
          {title}
        </h3>
        <span
          data-slot="todo-list-count"
          className={cn(
            "shrink-0 text-xs font-medium tabular-nums text-muted-foreground",
            allComplete && "text-success"
          )}
        >
          <span className="sr-only">
            {completedLabel(completed, items.length)}
          </span>
          <span aria-hidden="true" className="inline-flex">
            <SwapText value={String(completed)}>{completed}</SwapText>
            <span>/</span>
            <span>{items.length}</span>
          </span>
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduce ? { duration: 0 } : SPRING_SWAP}
          className="text-muted-foreground/50 transition-colors group-hover:text-muted-foreground"
        >
          <ChevronDownIcon className="size-3.5" />
        </motion.span>
      </button>

      <Disclosure
        id={contentId}
        role="region"
        aria-labelledby={triggerId}
        open={currentOpen}
      >
        <div
          data-slot="todo-list-viewport"
          ref={viewportRef}
          className="overflow-y-auto px-2 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maxHeight }}
        >
          {items.length ? (
            <ol
              data-slot="todo-list-items"
              aria-live="polite"
              className="space-y-0"
            >
              <AnimatePresence initial={false} mode="popLayout">
                {items.map((item) => {
                  const status = item.status ?? "pending";
                  return (
                    <motion.li
                      data-slot="todo-list-item"
                      data-status={status}
                      layout="position"
                      key={item.id}
                      initial={reduce ? { opacity: 1 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -3 }}
                      transition={
                        reduce
                          ? { duration: 0 }
                          : {
                              opacity: { duration: 0.18, ease: EASE_OUT },
                              y: SPRING_LAYOUT,
                              layout: SPRING_LAYOUT,
                            }
                      }
                      className="flex min-h-9 items-center gap-2.5 rounded-xl px-1.5 py-1"
                    >
                      <TodoStatusIcon
                        status={status}
                        progress={item.progress}
                      />
                      <span className="sr-only">{labels[status]}: </span>
                      <span
                        data-slot="todo-list-item-title"
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm leading-5",
                          status === "pending" && "text-muted-foreground/65",
                          status === "in-progress" && "text-foreground",
                          status === "completed" && "text-muted-foreground/60",
                          status === "cancelled" && "text-muted-foreground/55"
                        )}
                      >
                        <span className="relative inline-block max-w-full">
                          {item.title}
                          {/* The strike-through draws left to right on completion. */}
                          <motion.span
                            aria-hidden="true"
                            initial={false}
                            animate={{
                              scaleX: status === "completed" ? 1 : 0,
                              opacity: status === "completed" ? 1 : 0,
                            }}
                            transition={
                              reduce
                                ? { duration: 0 }
                                : {
                                    duration: 0.28,
                                    ease: EASE_OUT,
                                    delay: 0.06,
                                  }
                            }
                            className="absolute inset-x-0 top-1/2 h-px origin-left bg-current"
                          />
                        </span>
                      </span>
                      {item.detail ? (
                        <span
                          data-slot="todo-list-item-detail"
                          className="shrink-0 text-sm text-muted-foreground/55"
                        >
                          {item.detail}
                        </span>
                      ) : null}
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ol>
          ) : (
            <p
              data-slot="todo-list-empty"
              className="px-1.5 py-2 text-sm text-muted-foreground"
            >
              {emptyLabel}
            </p>
          )}
        </div>
      </Disclosure>
    </section>
  );
}

export { TodoList };
