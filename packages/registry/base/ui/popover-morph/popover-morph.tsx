"use client";

/*
 * A popover whose trigger becomes its panel: the trigger's surface and the
 * panel share a layoutId, so opening grows the one surface out of the
 * trigger and closing folds it back in.
 *
 * Behaviour is Base UI's non-modal Dialog rather than its Popover: the
 * Popover's Positioner owns the popup's geometry and settles it after
 * mount, which fights a shared-layout morph measuring the same box. A
 * non-modal Dialog keeps what a popover needs — Escape and outside-press
 * dismissal, closing when focus leaves, focus in and back to the trigger —
 * and leaves placement to this item, which anchors the panel to the
 * trigger's rect.
 */

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { EASE_OUT, SPRING_LAYOUT, useOpenState } from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

type Side = "top" | "bottom";
type Align = "start" | "end";

type AnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  viewportWidth: number;
  viewportHeight: number;
};

type MorphPopoverContextValue = {
  open: boolean;
  /** True once the panel can be placed; the trigger hands its surface over then. */
  showPanel: boolean;
  anchor: AnchorRect | null;
  layoutId: string;
  triggerRef: React.RefObject<HTMLElement | null>;
};

const MorphPopoverContext =
  React.createContext<MorphPopoverContextValue | null>(null);

function useMorphPopover(component: string) {
  const context = React.useContext(MorphPopoverContext);
  if (!context) {
    throw new Error(`${component} must be used within <MorphPopover>`);
  }
  return context;
}

// The layout morph settles in about this long; the popup stays mounted
// through it so the panel can fold back into the trigger.
const MORPH_HOLD = 0.4;

function measure(node: HTMLElement): AnchorRect {
  const rect = node.getBoundingClientRect();
  const root = document.documentElement;
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    viewportWidth: root.clientWidth,
    viewportHeight: root.clientHeight,
  };
}

function sameRect(a: AnchorRect | null, b: AnchorRect) {
  return (
    a !== null &&
    a.top === b.top &&
    a.right === b.right &&
    a.bottom === b.bottom &&
    a.left === b.left &&
    a.viewportWidth === b.viewportWidth &&
    a.viewportHeight === b.viewportHeight
  );
}

export type MorphPopoverProps = Omit<DialogPrimitive.Root.Props, "modal">;

/**
 * The root. Controlled (`open` + `onOpenChange`) or uncontrolled
 * (`defaultOpen`), like any Base UI root.
 */
function MorphPopover({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: MorphPopoverProps) {
  const [open, setOpen] = useOpenState(openProp, defaultOpen, onOpenChange);
  const [anchor, setAnchor] = React.useState<AnchorRect | null>(null);
  const triggerRef = React.useRef<HTMLElement | null>(null);
  const layoutId = `morph-popover-${React.useId()}`;

  // Track the trigger while open, so the panel follows a scroll or resize.
  React.useLayoutEffect(() => {
    const trigger = triggerRef.current;
    if (!open || !trigger) return;
    const update = () => {
      const next = measure(trigger);
      setAnchor((current) => (sameRect(current, next) ? current : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(trigger);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  const context = React.useMemo<MorphPopoverContextValue>(
    () => ({
      open,
      showPanel: open && anchor !== null,
      anchor,
      layoutId,
      triggerRef,
    }),
    [open, anchor, layoutId]
  );

  return (
    <MorphPopoverContext.Provider value={context}>
      <DialogPrimitive.Root
        data-slot="morph-popover"
        modal={false}
        open={open}
        onOpenChange={setOpen}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </MorphPopoverContext.Provider>
  );
}

export interface MorphPopoverTriggerProps
  extends React.ComponentProps<typeof DialogPrimitive.Trigger> {
  /** The trigger surface's corner radius, in px. Default 8. */
  radius?: number;
}

/**
 * The trigger. Its surface is the shape the panel grows out of; its label
 * fades while the panel is out. Pass `render` to swap the element — a
 * transparent one, since the surface draws the fill.
 */
function MorphPopoverTrigger({
  radius = 8,
  className,
  children,
  ref,
  ...props
}: MorphPopoverTriggerProps) {
  const context = useMorphPopover("MorphPopoverTrigger");
  const reduced = useReducedMotion() ?? false;
  const { triggerRef } = context;

  const setRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref, triggerRef]
  );

  return (
    <DialogPrimitive.Trigger
      data-slot="morph-popover-trigger"
      ref={setRef}
      className={cn(
        "relative isolate inline-flex h-8 items-center gap-1.5 px-3 text-sm font-medium text-foreground outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      style={{ borderRadius: radius }}
      {...props}
    >
      {!context.showPanel && (
        <motion.span
          aria-hidden
          layoutId={reduced ? undefined : context.layoutId}
          transition={SPRING_LAYOUT}
          className="absolute inset-0 -z-10 border border-border bg-popover shadow-xs"
          style={{ borderRadius: radius }}
        />
      )}
      <span
        className={cn(
          "inline-flex items-center gap-1.5 transition-opacity duration-fast ease-standard motion-reduce:transition-none",
          context.showPanel && "opacity-0"
        )}
      >
        {children}
      </span>
    </DialogPrimitive.Trigger>
  );
}

export interface MorphPopoverContentProps
  extends Omit<DialogPrimitive.Popup.Props, "children" | "className"> {
  className?: string;
  children?: React.ReactNode;
  /** Which side of the trigger the panel opens on. Default "bottom". */
  side?: Side;
  /** Which trigger edge the panel lines up with. Default "end". */
  align?: Align;
  /** Gap between trigger and panel, in px. Default 8. */
  sideOffset?: number;
  /** Panel corner radius, in px. Default 8. */
  radius?: number;
}

/** The panel, grown out of the trigger's surface. */
function MorphPopoverContent({
  side = "bottom",
  align = "end",
  sideOffset = 8,
  radius = 8,
  className,
  style,
  children,
  ...props
}: MorphPopoverContentProps) {
  const context = useMorphPopover("MorphPopoverContent");
  const reduced = useReducedMotion() ?? false;
  const anchor = context.anchor;

  const placement: React.CSSProperties = anchor
    ? {
        position: "fixed",
        ...(side === "bottom"
          ? { top: anchor.bottom + sideOffset }
          : { bottom: anchor.viewportHeight - anchor.top + sideOffset }),
        ...(align === "start"
          ? { left: anchor.left }
          : { right: anchor.viewportWidth - anchor.right }),
      }
    : { position: "fixed" };

  return (
    <AnimatePresence>
      {context.showPanel && (
        <DialogPrimitive.Portal keepMounted>
          <DialogPrimitive.Popup
            data-slot="morph-popover-content"
            // Opacity stays on the popup so Base UI waits out the fold back.
            render={
              <motion.div
                initial={{ opacity: 0.9999 }}
                animate={{ opacity: 1 }}
                exit={{
                  opacity: 0.9999,
                  transition: { duration: reduced ? 0 : MORPH_HOLD },
                }}
              />
            }
            className="z-popover text-sm text-popover-foreground outline-none"
            style={{ ...placement, ...style }}
            {...props}
          >
            <motion.div
              layoutId={reduced ? undefined : context.layoutId}
              transition={SPRING_LAYOUT}
              className="overflow-hidden border border-border bg-popover shadow-lg"
              style={{ borderRadius: radius }}
            >
              <motion.div
                layout={reduced ? false : "position"}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: {
                    duration: reduced ? 0 : 0.2,
                    delay: reduced ? 0 : 0.06,
                    ease: EASE_OUT,
                  },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: reduced ? 0 : 0.1, ease: EASE_OUT },
                }}
                className={cn("p-3", className)}
              >
                {children}
              </motion.div>
            </motion.div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

function MorphPopoverTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="morph-popover-title"
      className={cn("text-sm font-medium", className)}
      {...props}
    />
  );
}

function MorphPopoverDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="morph-popover-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function MorphPopoverClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="morph-popover-close" {...props} />;
}

export {
  MorphPopover,
  MorphPopoverClose,
  MorphPopoverContent,
  MorphPopoverDescription,
  MorphPopoverTitle,
  MorphPopoverTrigger,
};
