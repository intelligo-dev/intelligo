"use client";

/*
 * The scrolling transcript: a
 * viewport that keeps streamed output pinned to the live edge while the
 * reader stays near it, lets go the moment they scroll up, and can grow
 * a compact preview rail for jumping between message rows. import * as React from "react";
import { ArrowDownIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { EASE_OUT, SPRING_LAYOUT } from "@showcase/components/ui/ai-motion";
import { cn } from "@showcase/lib/utils";

/* ----------------------------------------------------------------------------
 * Gesture hooks (upstream lib/hooks). A click carries no pointerType, and a
 * finger cannot hover, so the rail needs to know which input is behind
 * each activation and when a pinned preview should let go.
 * ------------------------------------------------------------------------- */

interface BoundaryEvent {
  pointerId: number;
  pointerType: string;
  buttons: number;
}

/**
 * Whether this event came from a pointer that is *hovering*: not a touch,
 * and not currently pressed. A pen resting on the glass is making contact,
 * not hovering: `buttons` is the tell.
 */
const isHoveringPointer = (event: { pointerType: string; buttons: number }) =>
  event.pointerType !== "touch" && event.buttons === 0;

/**
 * Pairs a surface's enter with its leave, per pointer. The state a hover
 * holds is released by the pointer that took it, whatever the buttons say
 * at the boundary, and a pointer that arrived in contact never took it.
 */
function useHoverGesture() {
  const contact = React.useRef(new Set<number>());

  return React.useMemo(
    () => ({
      /** True when this enter starts a hover: the pointer arrived resting. */
      enter: (event: BoundaryEvent) => {
        if (isHoveringPointer(event)) {
          contact.current.delete(event.pointerId);
          return true;
        }
        contact.current.add(event.pointerId);
        return false;
      },
      /** True when this leave ends a hover that entered as one. */
      leave: (event: BoundaryEvent) => {
        const arrivedInContact = contact.current.delete(event.pointerId);
        return !arrivedInContact && event.pointerType !== "touch";
      },
    }),
    []
  );
}

interface TapRecord<S> {
  pointerType: string;
  state: S;
}

/**
 * The pointer gesture behind a click, recorded where the click cannot
 * report it. The record is spent by one click and dropped by everything
 * else (`pointercancel`, a keydown), because a record that outlives its
 * gesture would be read by the next keyboard-synthesised click.
 */
function useTapGesture<S>() {
  const record = React.useRef<TapRecord<S> | null>(null);

  return React.useMemo(
    () => ({
      start: (event: { pointerType: string }, state: S) => {
        record.current = { pointerType: event.pointerType, state };
      },
      take: () => {
        const spent = record.current;
        record.current = null;
        return spent;
      },
      drop: () => {
        record.current = null;
      },
    }),
    []
  );
}

/**
 * Close an open overlay on Escape or a pointerdown outside `ref`. The
 * pointerdown listener is capture-phase: a bubble-phase one is blinded by
 * any handler in between that stops propagation. The gesture passes
 * through — the card is a preview, so the tap also lands where it aimed.
 */
function useDismiss(
  open: boolean,
  onDismiss: () => void,
  ref: React.RefObject<HTMLElement | null>
) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onDismiss();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || ref.current?.contains(target)) return;
      onDismiss();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open, onDismiss, ref]);
}

/* ----------------------------------------------------------------------------
 * PreviewRail (upstream components/motion/preview-rail): a column of ticks,
 * one per section, that grow towards the pointer and show a preview card
 * for the one under it.
 * ------------------------------------------------------------------------- */

export interface PreviewRailItem {
  id: string;
  label: string;
  ariaLabel?: string;
  description?: React.ReactNode;
  href?: string;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
}

export interface PreviewRailProps {
  items: PreviewRailItem[];
  /** Accessible name of the navigation landmark. */
  label?: string;
  orientation?: "vertical" | "horizontal";
  activeId?: string;
  defaultActiveId?: string;
  onActiveChange?: (id: string) => void;
  onItemSelect?: (item: PreviewRailItem) => void;
  renderPreview?: (item: PreviewRailItem) => React.ReactNode;
  showPreview?: boolean;
  previewSide?: "before" | "after";
  highlightActive?: boolean;
  itemSize?: number;
  children?: React.ReactNode;
  className?: string;
  railClassName?: string;
  previewContainerClassName?: string;
  previewClassName?: string;
}

function DefaultPreview({ item }: { item: PreviewRailItem }) {
  return (
    <div
      data-slot="preview-rail-card"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <p
        data-slot="preview-rail-title"
        className="font-medium text-card-foreground"
      >
        {item.label}
      </p>
      {item.description ? (
        <div
          data-slot="preview-rail-description"
          className="mt-1 text-sm leading-6 text-muted-foreground"
        >
          {item.description}
        </div>
      ) : null}
    </div>
  );
}

function PreviewRail({
  items,
  label = "Section navigation",
  orientation = "vertical",
  activeId,
  defaultActiveId,
  onActiveChange,
  onItemSelect,
  renderPreview,
  showPreview = true,
  previewSide = "after",
  highlightActive = false,
  itemSize = 24,
  children,
  className,
  railClassName,
  previewContainerClassName,
  previewClassName,
}: PreviewRailProps) {
  const uid = React.useId();
  const reduced = useReducedMotion() ?? false;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const [internalActiveId, setInternalActiveId] = React.useState(
    defaultActiveId ?? items[0]?.id ?? ""
  );
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  // A finger cannot hover, so a tap lights the tick instead. Kept apart from
  // the hovered one: they end in different ways, and a stray mouse move must
  // not clear a tick the keyboard or a tap chose.
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  // A click carries no pointerType, so the pointerdown before it is what says
  // whether the activation was a tap. Keyboard activation has none at all.
  const tap = useTapGesture<boolean>();
  const hover = useHoverGesture();

  const clearPinned = React.useCallback(() => setPinnedId(null), []);

  // The next tap outside the rail stands in for the pointer leaving it.
  useDismiss(pinnedId !== null, clearPinned, rootRef);

  const requestedActiveId = activeId ?? internalActiveId;
  const selectedId = items.some((item) => item.id === requestedActiveId)
    ? requestedActiveId
    : (items[0]?.id ?? "");
  const displayedId = hoveredId ?? pinnedId ?? focusedId ?? "";
  const highlightedId = displayedId || (highlightActive ? selectedId : "");
  const displayedIndex = items.findIndex((item) => item.id === highlightedId);
  const rowTemplate = items.length
    ? `repeat(${items.length}, ${itemSize}px)`
    : undefined;
  const isHorizontal = orientation === "horizontal";

  const selectItem = (id: string) => {
    if (activeId === undefined) setInternalActiveId(id);
    onActiveChange?.(id);
  };

  return (
    <motion.div
      layoutRoot
      ref={rootRef}
      data-slot="preview-rail"
      onBlur={(event) => {
        // Both tick sources leave with the focus: a tap does not always land
        // focus, but when it does, tabbing away must not strand the card.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setFocusedId(null);
          setPinnedId(null);
        }
      }}
      className={cn(
        "isolate relative flex w-full overflow-visible",
        isHorizontal
          ? "min-h-64 flex-col items-center justify-center"
          : "min-h-80",
        className
      )}
    >
      <nav
        data-slot="preview-rail-nav"
        aria-label={label}
        onPointerLeave={(event) => {
          // A touch pointer leaves on lift, which would clear the tick the tap
          // just chose — that one is cleared by the outside tap instead.
          if (hover.leave(event)) setHoveredId(null);
        }}
        style={
          isHorizontal
            ? { gridTemplateColumns: rowTemplate }
            : { gridTemplateRows: rowTemplate }
        }
        className={cn(
          "relative z-10 grid shrink-0",
          isHorizontal
            ? "h-12 w-fit max-w-full self-center justify-center"
            : "w-12 content-center",
          railClassName
        )}
      >
        {items.map((item, index) => {
          const selected = item.id === selectedId;
          const highlighted = item.id === highlightedId;
          const distance =
            displayedIndex < 0
              ? Number.POSITIVE_INFINITY
              : Math.abs(index - displayedIndex);
          const scale = highlighted
            ? 1
            : distance === 1
              ? 0.68
              : distance === 2
                ? 0.44
                : 0.25;

          const itemContent = (
            <motion.span
              data-slot="preview-rail-tick"
              aria-hidden="true"
              animate={isHorizontal ? { scaleY: scale } : { scaleX: scale }}
              transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
              className={cn(
                "block bg-current",
                isHorizontal
                  ? "h-12 w-0.5 origin-bottom"
                  : "h-0.5 w-12 origin-left",
                highlighted ? "text-foreground" : undefined
              )}
            />
          );

          const sharedClassName = cn(
            "relative flex text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            isHorizontal
              ? "h-12 w-6 items-end justify-center"
              : "h-6 w-12 items-center"
          );
          const sharedStyle = isHorizontal
            ? { width: itemSize }
            : { height: itemSize };
          const handlePointerEnter = (
            event: React.PointerEvent<HTMLElement>
          ) => {
            if (hover.enter(event)) setHoveredId(item.id);
          };
          const handlePointerDown = (
            event: React.PointerEvent<HTMLElement>
          ) => {
            tap.start(event, pinnedId === item.id);
            setFocusedId(null);
          };
          // A gesture the platform takes away sends no click, and a key press
          // starts an activation that never had a pointer behind it: either
          // one leaves a record the next click would read as a tap of its own.
          const dropGesture = () => tap.drop();
          const handleFocus = (currentTarget: HTMLElement) => {
            if (currentTarget.matches(":focus-visible")) {
              setFocusedId(item.id);
            }
          };
          const handleSelect = (event: React.MouseEvent<HTMLElement>) => {
            const gesture = tap.take();
            const tapped = gesture !== null && gesture.pointerType !== "mouse";

            if (tapped) {
              // A link would otherwise show its preview and leave the page in
              // the same tap, so the card is never read: the first tap lights
              // the tick, the second follows the link.
              if (item.href && !gesture.state) {
                event.preventDefault();
                setPinnedId(item.id);
                return;
              }
              setPinnedId(item.id);
            }

            selectItem(item.id);
            onItemSelect?.(item);
          };

          return item.href ? (
            <a
              key={item.id}
              data-slot="preview-rail-item"
              href={item.href}
              target={item.target}
              rel={
                item.rel ??
                (item.target === "_blank" ? "noreferrer noopener" : undefined)
              }
              aria-label={item.ariaLabel ?? item.label}
              aria-current={selected ? "page" : undefined}
              onPointerEnter={handlePointerEnter}
              onPointerDown={handlePointerDown}
              onPointerCancel={dropGesture}
              onKeyDown={dropGesture}
              onFocus={(event) => handleFocus(event.currentTarget)}
              onClick={handleSelect}
              style={sharedStyle}
              className={sharedClassName}
            >
              {itemContent}
            </a>
          ) : (
            <button
              key={item.id}
              data-slot="preview-rail-item"
              type="button"
              aria-label={item.ariaLabel ?? item.label}
              aria-current={selected ? "location" : undefined}
              onPointerEnter={handlePointerEnter}
              onPointerDown={handlePointerDown}
              onPointerCancel={dropGesture}
              onKeyDown={dropGesture}
              onFocus={(event) => handleFocus(event.currentTarget)}
              onClick={handleSelect}
              style={sharedStyle}
              className={sharedClassName}
            >
              {itemContent}
            </button>
          );
        })}
      </nav>

      {showPreview ? (
        <div
          data-slot="preview-rail-previews"
          aria-hidden="true"
          style={
            isHorizontal
              ? { gridTemplateColumns: rowTemplate }
              : { gridTemplateRows: rowTemplate }
          }
          className={cn(
            "pointer-events-none absolute z-50 grid",
            isHorizontal
              ? "top-1/2 left-1/2 h-5 w-fit max-w-full -translate-x-1/2 -translate-y-1/2 justify-center"
              : previewSide === "before"
                ? "inset-y-0 right-16 left-4 content-center"
                : "inset-y-0 right-4 left-16 content-center",
            previewContainerClassName
          )}
        >
          {items.map((item) => (
            <div
              key={item.id}
              style={
                isHorizontal ? { width: itemSize } : { height: itemSize }
              }
              className={cn(
                "relative flex items-center",
                isHorizontal ? "justify-center" : undefined
              )}
            >
              {item.id === displayedId ? (
                <div
                  className={cn(
                    isHorizontal
                      ? "absolute bottom-12 left-1/2 w-72 -translate-x-1/2"
                      : cn(
                          "w-full max-w-sm",
                          previewSide === "before" && "ml-auto"
                        ),
                    previewClassName
                  )}
                >
                  <motion.div
                    layoutId={`preview-rail-card-${uid}`}
                    transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div
                        key={item.id}
                        initial={
                          reduced
                            ? { opacity: 0 }
                            : { opacity: 0, y: 4, filter: "blur(6px)" }
                        }
                        animate={
                          reduced
                            ? { opacity: 1 }
                            : { opacity: 1, y: 0, filter: "blur(0px)" }
                        }
                        exit={
                          reduced
                            ? { opacity: 0 }
                            : {
                                opacity: 0,
                                y: -2,
                                filter: "blur(4px)",
                                transition: { duration: 0.12, ease: EASE_OUT },
                              }
                        }
                        transition={{
                          duration: reduced ? 0 : 0.18,
                          ease: EASE_OUT,
                        }}
                      >
                        {renderPreview ? (
                          renderPreview(item)
                        ) : (
                          <DefaultPreview item={item} />
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {children ? (
        <div className="min-h-0 min-w-0 flex-1">{children}</div>
      ) : null}
    </motion.div>
  );
}

/* ----------------------------------------------------------------------------
 * MessageScroller
 * ------------------------------------------------------------------------- */

const PREVIEW_TITLE_LENGTH = 56;
const PREVIEW_DESCRIPTION_LENGTH = 88;

function truncateMessageText(text: string, limit: number) {
  if (text.length <= limit) return text;
  const excerpt = text.slice(0, limit);
  const boundary = excerpt.lastIndexOf(" ");
  return `${excerpt.slice(0, boundary > limit * 0.65 ? boundary : limit).trim()}…`;
}

function getMessageText(message: HTMLElement) {
  const surface =
    message.querySelector<HTMLElement>('[data-slot="message-bubble-content"]') ??
    message.querySelector<HTMLElement>('[data-slot="message-content"]') ??
    message;
  return (surface.textContent ?? "").replace(/\s+/g, " ").trim();
}

function getMessagePreview(
  message: HTMLElement,
  emptyLabel: string,
  assistantResponse?: HTMLElement
) {
  const text = getMessageText(message);
  if (!text) {
    return { label: emptyLabel, description: undefined };
  }

  if (text.length <= PREVIEW_TITLE_LENGTH) {
    const responseText = assistantResponse
      ? getMessageText(assistantResponse)
      : "";
    return {
      label: text,
      description: responseText
        ? truncateMessageText(responseText, PREVIEW_DESCRIPTION_LENGTH)
        : undefined,
    };
  }

  const titleExcerpt = text.slice(0, PREVIEW_TITLE_LENGTH);
  const titleBoundary = titleExcerpt.lastIndexOf(" ");
  const titleEnd =
    titleBoundary > PREVIEW_TITLE_LENGTH * 0.65
      ? titleBoundary
      : PREVIEW_TITLE_LENGTH;
  const label = `${text.slice(0, titleEnd).trim()}…`;
  const responseText = assistantResponse
    ? getMessageText(assistantResponse)
    : text.slice(titleEnd).trim();
  return {
    label,
    description: responseText
      ? truncateMessageText(responseText, PREVIEW_DESCRIPTION_LENGTH)
      : undefined,
  };
}

export interface MessageScrollerProps extends React.ComponentProps<"div"> {
  /** Keep streamed output pinned while the reader remains near the end. */
  followOutput?: boolean;
  /** Distance from the end that still counts as following the output. */
  followThreshold?: number;
  /** Smoothly follow growing content. */
  smooth?: boolean;
  /** Reports when the reader leaves or returns to the live edge. */
  onFollowChange?: (following: boolean) => void;
  /** Accessible label for the scrollable transcript. */
  label?: string;
  /** Marks the transcript as waiting for more streamed content. */
  busy?: boolean;
  /** Adds a compact rail for navigating between rendered Message rows. */
  navigation?: "rail";
  /** Accessible label for the optional message navigation rail. */
  navigationLabel?: string;
  /** Accessible label of one rail tick; `sender` is the row's `data-from`. */
  navigationItemLabel?: (
    sender: string,
    index: number,
    total: number
  ) => string;
  /** Preview title for a row that has no readable text. */
  emptyPreviewLabel?: string;
  /**
   * Accessible name of the control that brings a reader who scrolled
   * up back to the live edge. Unset hides the control.
   */
  scrollToEndLabel?: string;
  /**
   * A value that changes when the reader does something that should
   * bring them back to the end — the id of their latest message. A
   * change re-engages following and scrolls down, even if they had
   * scrolled away.
   */
  anchor?: string | number;
  viewportClassName?: string;
  contentClassName?: string;
  railClassName?: string;
  viewportRef?: React.Ref<HTMLElement>;
  viewportProps?: Omit<
    React.ComponentProps<"section">,
    "children" | "className" | "ref"
  >;
  contentProps?: Omit<
    React.ComponentProps<"div">,
    "children" | "className" | "ref"
  >;
}

const defaultNavigationItemLabel = (
  sender: string,
  index: number,
  total: number
) => `Go to ${sender} message ${index + 1} of ${total}`;

function MessageScroller({
  followOutput = true,
  followThreshold = 56,
  smooth = true,
  onFollowChange,
  label = "Conversation",
  busy,
  navigation,
  navigationLabel = "Message navigation",
  navigationItemLabel = defaultNavigationItemLabel,
  emptyPreviewLabel = "Message",
  scrollToEndLabel = "Scroll to the latest message",
  anchor,
  viewportClassName,
  contentClassName,
  railClassName,
  viewportRef: externalViewportRef,
  viewportProps,
  contentProps,
  className,
  children,
  ...props
}: MessageScrollerProps) {
  const reduced = useReducedMotion() ?? false;
  const viewportRef = React.useRef<HTMLElement | null>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const followingRef = React.useRef(followOutput);
  const programmaticScrollRef = React.useRef(false);
  const scrollTimerRef = React.useRef<number | undefined>(undefined);
  const frameRef = React.useRef<number | undefined>(undefined);
  const railFrameRef = React.useRef<number | undefined>(undefined);
  const railIdRef = React.useRef(new WeakMap<HTMLElement, string>());
  const railIdCounterRef = React.useRef(0);
  const railTargetsRef = React.useRef(new Map<string, HTMLElement>());
  const [railItems, setRailItems] = React.useState<PreviewRailItem[]>([]);
  const [activeRailId, setActiveRailId] = React.useState("");
  const [railOverflowing, setRailOverflowing] = React.useState(false);
  const {
    onScroll: onViewportScroll,
    onWheel: onViewportWheel,
    onTouchStart: onViewportTouchStart,
    onPointerDown: onViewportPointerDown,
    onKeyDown: onViewportKeyDown,
    ...restViewportProps
  } = viewportProps ?? {};

  const setViewportRef = React.useCallback(
    (node: HTMLElement | null) => {
      viewportRef.current = node;
      if (typeof externalViewportRef === "function") {
        externalViewportRef(node);
      } else if (externalViewportRef) {
        externalViewportRef.current = node;
      }
    },
    [externalViewportRef]
  );

  // Mirrors `followingRef` for rendering: the scroll-to-latest control
  // shows only while the reader is away from the live edge.
  const [atEnd, setAtEnd] = React.useState(followOutput);

  const setFollowing = React.useCallback(
    (next: boolean) => {
      if (followingRef.current === next) return;
      followingRef.current = next;
      setAtEnd(next);
      onFollowChange?.(next);
    },
    [onFollowChange]
  );

  const updateActiveRailItem = React.useCallback(() => {
    if (navigation !== "rail") return;
    const viewport = viewportRef.current;
    const targets = [...railTargetsRef.current.entries()];
    if (!viewport || targets.length === 0) return;

    const viewportRect = viewport.getBoundingClientRect();
    if (viewport.scrollTop <= followThreshold) {
      const firstId = targets[0]?.[0] ?? "";
      setActiveRailId((current) => (current === firstId ? current : firstId));
      return;
    }

    const distanceFromEnd =
      viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (distanceFromEnd <= followThreshold) {
      const lastId = targets.at(-1)?.[0] ?? "";
      setActiveRailId((current) => (current === lastId ? current : lastId));
      return;
    }

    const viewportCenter = viewportRect.top + viewportRect.height / 2;
    let nearestId = targets[0]?.[0] ?? "";
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const [id, element] of targets) {
      const rect = element.getBoundingClientRect();
      const messageCenter = rect.top + rect.height / 2;
      const distance = Math.abs(messageCenter - viewportCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }

    setActiveRailId((current) =>
      current === nearestId ? current : nearestId
    );
  }, [followThreshold, navigation]);

  const syncRailItems = React.useCallback(() => {
    if (navigation !== "rail") return;
    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport) return;

    const messages = Array.from(
      content.querySelectorAll<HTMLElement>('[data-slot="message"]')
    );
    const targets = new Map<string, HTMLElement>();
    const nextItems = messages.map((message, index) => {
      let id = railIdRef.current.get(message);
      if (!id) {
        railIdCounterRef.current += 1;
        id = `message-rail-${railIdCounterRef.current}`;
        railIdRef.current.set(message, id);
      }
      targets.set(id, message);
      const sender = message.dataset.from ?? "conversation";
      const assistantResponse =
        sender === "user"
          ? messages
              .slice(index + 1)
              .find((candidate) => candidate.dataset.from === "assistant")
          : undefined;
      const preview = getMessagePreview(
        message,
        emptyPreviewLabel,
        assistantResponse
      );

      return {
        id,
        label: preview.label,
        description: preview.description,
        ariaLabel: navigationItemLabel(sender, index, messages.length),
      };
    });

    railTargetsRef.current = targets;
    setRailItems((current) => {
      const unchanged =
        current.length === nextItems.length &&
        current.every(
          (item, index) =>
            item.id === nextItems[index]?.id &&
            item.label === nextItems[index]?.label &&
            item.description === nextItems[index]?.description &&
            item.ariaLabel === nextItems[index]?.ariaLabel
        );
      return unchanged ? current : nextItems;
    });
    setRailOverflowing(
      viewport.scrollHeight > viewport.clientHeight + 1 && messages.length > 1
    );
  }, [emptyPreviewLabel, navigation, navigationItemLabel]);

  const scheduleRailSync = React.useCallback(() => {
    if (navigation !== "rail") return;
    if (railFrameRef.current) cancelAnimationFrame(railFrameRef.current);
    railFrameRef.current = requestAnimationFrame(() => {
      syncRailItems();
      updateActiveRailItem();
    });
  }, [navigation, syncRailItems, updateActiveRailItem]);

  const scrollToEnd = React.useCallback((behavior: ScrollBehavior) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    programmaticScrollRef.current = true;
    if (typeof viewport.scrollTo === "function") {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    } else {
      viewport.scrollTop = viewport.scrollHeight;
    }
    if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = window.setTimeout(
      () => {
        programmaticScrollRef.current = false;
      },
      behavior === "smooth" ? 320 : 0
    );
  }, []);

  // Following is decided by direction, not by distance alone: a smooth
  // scroll down a long transcript outlives any fixed "programmatic"
  // window, and content growing under the viewport widens the gap
  // without the reader doing anything. Only a move up that the reader
  // made lets go; reaching the end, by any means, takes hold again.
  const lastScrollTopRef = React.useRef(0);
  const handleScroll = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const top = viewport.scrollTop;
    const movedUp = top < lastScrollTopRef.current - 1;
    lastScrollTopRef.current = top;
    const distance = viewport.scrollHeight - top - viewport.clientHeight;
    if (distance <= followThreshold) setFollowing(true);
    else if (movedUp && !programmaticScrollRef.current) setFollowing(false);
    updateActiveRailItem();
  }, [followThreshold, setFollowing, updateActiveRailItem]);

  const leaveLiveEdge = React.useCallback(() => {
    programmaticScrollRef.current = false;
  }, []);

  React.useLayoutEffect(() => {
    followingRef.current = followOutput;
    if (!followOutput) return;

    frameRef.current = requestAnimationFrame(() => scrollToEnd("auto"));
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [followOutput, scrollToEnd]);

  React.useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      scheduleRailSync();
      if (!followOutput || !followingRef.current) return;
      scrollToEnd(reduced || !smooth ? "auto" : "smooth");
    });
    observer.observe(content);

    return () => observer.disconnect();
  }, [followOutput, reduced, scheduleRailSync, scrollToEnd, smooth]);

  React.useEffect(() => {
    if (navigation !== "rail") {
      railTargetsRef.current.clear();
      setRailItems([]);
      setRailOverflowing(false);
      return;
    }

    const content = contentRef.current;
    const viewport = viewportRef.current;
    if (!content || !viewport) return;

    scheduleRailSync();
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(scheduleRailSync);
    mutationObserver?.observe(content, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleRailSync);
    resizeObserver?.observe(content);
    resizeObserver?.observe(viewport);

    return () => {
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [navigation, scheduleRailSync]);

  React.useEffect(
    () => () => {
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      if (railFrameRef.current) cancelAnimationFrame(railFrameRef.current);
    },
    []
  );

  const scrollToRailItem = React.useCallback(
    (item: PreviewRailItem) => {
      const viewport = viewportRef.current;
      const target = railTargetsRef.current.get(item.id);
      if (!viewport || !target) return;

      const lastItem = railItems.at(-1)?.id === item.id;
      setActiveRailId(item.id);
      if (lastItem) {
        setFollowing(true);
        scrollToEnd(reduced || !smooth ? "auto" : "smooth");
        return;
      }

      setFollowing(false);
      programmaticScrollRef.current = true;
      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const top =
        viewport.scrollTop +
        targetRect.top -
        viewportRect.top -
        (viewport.clientHeight - targetRect.height) / 2;
      const behavior: ScrollBehavior = reduced || !smooth ? "auto" : "smooth";

      if (typeof viewport.scrollTo === "function") {
        viewport.scrollTo({ top, behavior });
      } else {
        viewport.scrollTop = top;
      }
      if (scrollTimerRef.current) window.clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = window.setTimeout(
        () => {
          programmaticScrollRef.current = false;
        },
        behavior === "smooth" ? 320 : 0
      );
    },
    [railItems, reduced, scrollToEnd, setFollowing, smooth]
  );

  const anchorRef = React.useRef(anchor);
  React.useEffect(() => {
    if (anchorRef.current === anchor) return;
    anchorRef.current = anchor;
    setFollowing(true);
    scrollToEnd(reduced || !smooth ? "auto" : "smooth");
  }, [anchor, reduced, scrollToEnd, setFollowing, smooth]);

  const returnToEnd = React.useCallback(() => {
    setFollowing(true);
    scrollToEnd(reduced || !smooth ? "auto" : "smooth");
  }, [reduced, scrollToEnd, setFollowing, smooth]);

  const viewport = (
    <section
      ref={setViewportRef}
      data-slot="message-scroller-viewport"
      aria-label={label}
      {...restViewportProps}
      onScroll={(event) => {
        handleScroll();
        onViewportScroll?.(event);
      }}
      onWheel={(event) => {
        leaveLiveEdge();
        onViewportWheel?.(event);
      }}
      onTouchStart={(event) => {
        leaveLiveEdge();
        onViewportTouchStart?.(event);
      }}
      onPointerDown={(event) => {
        // A drag on the scrollbar is the reader's scroll too.
        leaveLiveEdge();
        onViewportPointerDown?.(event);
      }}
      onKeyDown={(event) => {
        if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
          leaveLiveEdge();
        }
        onViewportKeyDown?.(event);
      }}
      className={cn(
        "h-full overflow-y-auto overscroll-contain outline-none [overflow-anchor:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        navigation === "rail"
          ? "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "[scrollbar-gutter:stable]",
        viewportClassName,
        navigation === "rail" && railOverflowing && "pr-10"
      )}
    >
      <div
        ref={contentRef}
        data-slot="message-scroller-content"
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-busy={busy}
        className={contentClassName}
        {...contentProps}
      >
        {children}
      </div>
    </section>
  );

  return (
    <div
      data-slot="message-scroller"
      className={cn("relative min-h-0", className)}
      {...props}
    >
      {navigation === "rail" ? (
        <PreviewRail
          items={railOverflowing ? railItems : []}
          label={navigationLabel}
          activeId={activeRailId}
          onItemSelect={scrollToRailItem}
          previewSide="before"
          highlightActive
          itemSize={14}
          className="h-full min-h-0 overflow-hidden"
          previewContainerClassName="right-8 left-3"
          previewClassName="mr-1 w-64 max-w-full [&_[data-slot=preview-rail-card]]:h-20 [&_[data-slot=preview-rail-card]]:overflow-hidden [&_[data-slot=preview-rail-card]]:p-3 [&_[data-slot=preview-rail-title]]:line-clamp-1 [&_[data-slot=preview-rail-title]]:text-xs [&_[data-slot=preview-rail-title]]:leading-4 [&_[data-slot=preview-rail-description]]:line-clamp-2 [&_[data-slot=preview-rail-description]]:text-xs [&_[data-slot=preview-rail-description]]:leading-4"
          railClassName={cn(
            "absolute inset-y-3 right-1 w-7 content-center py-1 [&_[data-slot=preview-rail-item]]:w-7 [&_[data-slot=preview-rail-item]]:justify-end [&_[data-slot=preview-rail-tick]]:h-px [&_[data-slot=preview-rail-tick]]:w-4 [&_[data-slot=preview-rail-tick]]:origin-right",
            railOverflowing
              ? "pointer-events-auto opacity-100"
              : "pointer-events-none opacity-0",
            railClassName
          )}
        >
          {viewport}
        </PreviewRail>
      ) : (
        viewport
      )}
      <AnimatePresence>
        {scrollToEndLabel && !atEnd ? (
          <motion.button
            key="scroll-to-end"
            type="button"
            data-slot="message-scroller-button"
            aria-label={scrollToEndLabel}
            title={scrollToEndLabel}
            onClick={returnToEnd}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
            transition={reduced ? { duration: 0.12 } : SPRING_LAYOUT}
            className="absolute bottom-3 left-1/2 z-20 grid size-9 -translate-x-1/2 place-items-center rounded-full border bg-background text-muted-foreground shadow-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowDownIcon className="size-4" />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export { MessageScroller, PreviewRail };
