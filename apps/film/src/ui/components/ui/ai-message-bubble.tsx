"use client";

/*
 * The speech bubble inside a
 * message row: a surface that pops into place, a content layer that
 * fades in after it, grouped bubbles and a collapsible long body.
 * Alignment follows the surrounding `Message` unless
 * overridden.
 */

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { MessageSideContext } from "@ui/components/ui/ai-message";
import { EASE_OUT, SPRING_LAYOUT, SPRING_SWAP } from "@ui/components/ui/ai-motion";
import { cn } from "@ui/lib/utils";

export type MessageBubbleVariant =
  | "solid"
  | "soft"
  | "tint"
  | "outline"
  | "ghost"
  | "danger";
export type MessageBubbleAlign = "start" | "end";

interface MessageBubbleContextValue {
  align?: MessageBubbleAlign;
  animateIn: boolean;
  variant: MessageBubbleVariant;
}

const MessageBubbleContext = React.createContext<MessageBubbleContextValue>({
  animateIn: true,
  variant: "soft",
});
const MessageBubbleLayoutContext = React.createContext<() => void>(() => {});

export interface MessageBubbleProps
  extends Omit<HTMLMotionProps<"div">, "children"> {
  variant?: MessageBubbleVariant;
  /** Defaults to the surrounding Message alignment when omitted. */
  align?: MessageBubbleAlign;
  /** Plays the bubble entrance once when this component mounts. */
  animateIn?: boolean;
  children?: React.ReactNode;
}

export interface MessageBubbleContentProps extends React.ComponentProps<"div"> {
  /** Replaces the content element while preserving bubble styling. */
  render?: React.ReactElement;
}

export interface MessageBubbleGroupProps extends React.ComponentProps<"div"> {
  spacing?: "compact" | "default";
}

export interface MessageBubbleCollapsibleProps
  extends React.ComponentProps<"div"> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  collapsedLines?: 2 | 3 | 4 | 5 | 6;
  moreLabel?: React.ReactNode;
  lessLabel?: React.ReactNode;
  contentClassName?: string;
  triggerClassName?: string;
  children?: React.ReactNode;
}

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    }
  };
}

const BUBBLE_CONTENT_REVEAL = {
  duration: 0.12,
  ease: EASE_OUT,
  delay: 0.04,
} as const;

// Sent bubbles should pop into place quickly with one restrained overshoot.
const BUBBLE_POP = {
  type: "spring",
  stiffness: 520,
  damping: 27,
  mass: 0.52,
} as const;

function MessageBubble({
  variant = "soft",
  align,
  animateIn = false,
  className,
  children,
  initial,
  animate,
  exit,
  transition,
  layout,
  ...props
}: MessageBubbleProps) {
  const reduced = useReducedMotion() ?? false;
  const messageSide = React.useContext(MessageSideContext);
  const resolvedAlign = align ?? messageSide ?? "start";

  return (
    <MessageBubbleContext.Provider
      value={{ align: resolvedAlign, animateIn, variant }}
    >
      <motion.div
        data-slot="message-bubble"
        data-align={resolvedAlign}
        data-variant={variant}
        layout={layout}
        initial={initial ?? false}
        animate={animate}
        exit={
          exit ??
          (reduced ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.99 })
        }
        transition={
          transition ?? (reduced ? { duration: 0.12 } : SPRING_LAYOUT)
        }
        className={cn(
          "group/bubble flex w-full flex-col",
          resolvedAlign === "end" ? "items-end" : "items-start",
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    </MessageBubbleContext.Provider>
  );
}

function bubbleContentClass(
  variant: MessageBubbleVariant,
  interactive: boolean
) {
  return cn(
    "relative z-0 min-w-9 rounded-2xl px-3.5 py-2.5 text-sm leading-6 text-foreground",
    "[&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-background/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p+p]:mt-2 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-background/60 [&_pre]:p-3 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
    variant === "solid" && "text-background",
    variant === "ghost" && "w-full rounded-none px-0 py-0",
    variant === "danger" && "text-destructive",
    interactive &&
      "cursor-pointer text-left outline-none transition-[background-color,color,transform] duration-150 hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
  );
}

/** The bubble is capped at most of the column; ghost fills it. */
function bubbleContentStyle(
  variant: MessageBubbleVariant
): React.CSSProperties {
  return variant === "ghost" ? { maxWidth: "none" } : { maxWidth: "82%" };
}

function bubbleSurfaceClass(
  variant: MessageBubbleVariant,
  align: MessageBubbleAlign
) {
  return cn(
    "pointer-events-none absolute inset-0 -z-10",
    align === "end" ? "origin-bottom-right" : "origin-bottom-left",
    variant === "solid" && "bg-foreground",
    variant === "soft" && "bg-muted",
    variant === "tint" && "bg-primary/10",
    variant === "outline" && "border border-border/70 bg-background",
    variant === "danger" && "bg-destructive/10"
  );
}

function MessageBubbleContent({
  render,
  className,
  children,
  ref,
  style,
  ...props
}: MessageBubbleContentProps) {
  const reduced = useReducedMotion() ?? false;
  const {
    align = "start",
    animateIn,
    variant,
  } = React.useContext(MessageBubbleContext);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const notifyLayout = React.useCallback(
    () => setLayoutVersion((version) => version + 1),
    []
  );
  const interactive = render?.type === "button" || render?.type === "a";
  const classes = cn(bubbleContentClass(variant, interactive), className);
  const composedChildren = (
    <>
      {variant !== "ghost" ? (
        <motion.span
          aria-hidden="true"
          layout={reduced ? false : "size"}
          layoutDependency={layoutVersion}
          initial={animateIn && !reduced ? { opacity: 0, scale: 0.92 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : {
                  opacity: { duration: 0.12, ease: EASE_OUT },
                  scale: BUBBLE_POP,
                  layout: SPRING_LAYOUT,
                }
          }
          className={bubbleSurfaceClass(variant, align)}
          style={{ borderRadius: "inherit" }}
        />
      ) : null}
      <MessageBubbleLayoutContext.Provider value={notifyLayout}>
        <motion.div
          initial={animateIn ? { opacity: 0 } : false}
          animate={{ opacity: 1 }}
          transition={
            reduced ? { duration: 0.12, ease: EASE_OUT } : BUBBLE_CONTENT_REVEAL
          }
          className="relative"
        >
          {children}
        </motion.div>
      </MessageBubbleLayoutContext.Provider>
    </>
  );

  if (render) {
    // The element the caller hands in becomes the bubble — a <button>, an
    // <a> — and keeps the bubble's classes, ref and slot.
    const child = render as React.ReactElement<
      Record<string, unknown> & {
        className?: string;
        style?: React.CSSProperties;
        ref?: React.Ref<HTMLElement>;
      }
    >;

    return React.cloneElement(child, {
      ...props,
      ref: mergeRefs(child.props.ref, ref as React.Ref<HTMLElement> | undefined),
      className: cn(classes, child.props.className),
      style: { ...bubbleContentStyle(variant), ...style, ...child.props.style },
      children: composedChildren,
      "data-slot": "message-bubble-content",
    });
  }

  return (
    <div
      ref={ref}
      data-slot="message-bubble-content"
      className={classes}
      style={{ ...bubbleContentStyle(variant), ...style }}
      {...props}
    >
      {composedChildren}
    </div>
  );
}

function MessageBubbleGroup({
  spacing = "compact",
  className,
  ...props
}: MessageBubbleGroupProps) {
  return (
    <div
      data-slot="message-bubble-group"
      className={cn(
        "flex w-full flex-col",
        spacing === "compact" ? "gap-1.5" : "gap-3",
        className
      )}
      {...props}
    />
  );
}

const LINE_CLAMP_CLASS = {
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
  5: "line-clamp-5",
  6: "line-clamp-6",
} as const;

function MessageBubbleCollapsible({
  open,
  defaultOpen = false,
  onOpenChange,
  collapsedLines = 4,
  moreLabel = "Show more",
  lessLabel = "Show less",
  contentClassName,
  triggerClassName,
  className,
  children,
  ...props
}: MessageBubbleCollapsibleProps) {
  const reduced = useReducedMotion() ?? false;
  const contentId = React.useId();
  const notifyLayout = React.useContext(MessageBubbleLayoutContext);
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const currentOpen = open ?? internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      notifyLayout();
      if (open === undefined) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [notifyLayout, onOpenChange, open]
  );

  return (
    <div
      data-slot="message-bubble-collapsible"
      data-state={currentOpen ? "open" : "closed"}
      className={cn("w-full", className)}
      {...props}
    >
      <div
        id={contentId}
        data-slot="message-bubble-collapsible-content"
        className={cn(
          "transition-[mask-image] duration-200",
          !currentOpen && LINE_CLAMP_CLASS[collapsedLines],
          !currentOpen &&
            "[mask-image:linear-gradient(to_bottom,var(--foreground)_68%,transparent_100%)]",
          contentClassName
        )}
      >
        {children}
      </div>
      <button
        type="button"
        data-slot="message-bubble-collapsible-trigger"
        aria-expanded={currentOpen}
        aria-controls={contentId}
        onClick={() => setOpen(!currentOpen)}
        className={cn(
          "mt-2 inline-flex h-7 items-center gap-1 rounded-full px-2 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          triggerClassName
        )}
      >
        <span>{currentOpen ? lessLabel : moreLabel}</span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: currentOpen ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : SPRING_SWAP}
        >
          <ChevronDownIcon className="size-3.5" />
        </motion.span>
      </button>
    </div>
  );
}

export {
  MessageBubble,
  MessageBubbleContent,
  MessageBubbleGroup,
  MessageBubbleCollapsible,
};
