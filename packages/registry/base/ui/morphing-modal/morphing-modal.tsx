"use client";

/*
 * A card or button that opens into a dialog: the trigger's surface and the
 * panel share a layoutId, so the panel grows out of the trigger to the
 * centre (or the bottom) of the screen and folds back on close; swapping
 * `viewKey` cross-fades the content while the panel resizes around it.
 */

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  EASE_OUT,
  SPRING_LAYOUT,
  backdropMotion,
  useOpenState,
} from "@/components/ui/ai-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MorphingModalContextValue = {
  open: boolean;
  layoutId: string;
};

const MorphingModalContext =
  React.createContext<MorphingModalContextValue | null>(null);

function useMorphingModal(component: string) {
  const context = React.useContext(MorphingModalContext);
  if (!context) {
    throw new Error(`${component} must be used within <MorphingModal>`);
  }
  return context;
}

// The layout morph settles in about this long; the popup stays mounted
// through it so the panel can fold back into the trigger.
const MORPH_HOLD = 0.4;

const OVERLAY =
  "fixed inset-0 isolate z-overlay bg-background/60 supports-backdrop-filter:backdrop-blur-sm";

export type MorphingModalProps = DialogPrimitive.Root.Props;

/**
 * The root, a modal Base UI Dialog: focus trap, scroll lock, Escape and
 * backdrop dismissal (`disablePointerDismissal` turns the latter off).
 * Controlled or uncontrolled.
 */
function MorphingModal({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: MorphingModalProps) {
  const [open, setOpen] = useOpenState(openProp, defaultOpen, onOpenChange);
  const layoutId = `morphing-modal-${React.useId()}`;
  const context = React.useMemo(() => ({ open, layoutId }), [open, layoutId]);

  return (
    <MorphingModalContext.Provider value={context}>
      <DialogPrimitive.Root
        data-slot="morphing-modal"
        open={open}
        onOpenChange={setOpen}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </MorphingModalContext.Provider>
  );
}

export interface MorphingModalTriggerProps
  extends DialogPrimitive.Trigger.Props {
  /** The trigger surface's corner radius, in px. Default 12. */
  radius?: number;
}

/**
 * The card or button the modal grows out of. Its surface hands over to
 * the panel while open and its content fades, leaving the slot it holds.
 */
function MorphingModalTrigger({
  radius = 12,
  className,
  children,
  ...props
}: MorphingModalTriggerProps) {
  const context = useMorphingModal("MorphingModalTrigger");
  const reduced = useReducedMotion() ?? false;

  return (
    <DialogPrimitive.Trigger
      data-slot="morphing-modal-trigger"
      className={cn(
        "relative isolate flex flex-col items-start gap-1 p-4 text-left text-sm text-card-foreground outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      style={{ borderRadius: radius }}
      {...props}
    >
      {!context.open && (
        <motion.span
          aria-hidden
          layoutId={reduced ? undefined : context.layoutId}
          transition={SPRING_LAYOUT}
          className="absolute inset-0 -z-10 border border-border bg-card shadow-xs"
          style={{ borderRadius: radius }}
        />
      )}
      <span
        className={cn(
          "flex w-full flex-col items-start gap-1 transition-opacity duration-fast ease-standard motion-reduce:transition-none",
          context.open && "opacity-0"
        )}
      >
        {children}
      </span>
    </DialogPrimitive.Trigger>
  );
}

export interface MorphingModalContentProps
  extends Omit<DialogPrimitive.Popup.Props, "children" | "className"> {
  children?: React.ReactNode;
  className?: string;
  /** The current view. Changing it cross-fades the content and resizes the panel. */
  viewKey?: React.Key;
  /** "center" centres the panel; "bottom" anchors it to the viewport bottom. */
  placement?: "center" | "bottom";
  /** Panel corner radius, in px. Default 12. */
  radius?: number;
  /** Render the close control in the panel's top-right corner. Default true. */
  showCloseButton?: boolean;
  labels?: { close?: string };
}

/** The dialog panel, grown out of the trigger's surface. */
function MorphingModalContent({
  children,
  className,
  viewKey = "default",
  placement = "center",
  radius = 12,
  showCloseButton = true,
  labels,
  ...props
}: MorphingModalContentProps) {
  const context = useMorphingModal("MorphingModalContent");
  const reduced = useReducedMotion() ?? false;
  const instant = { duration: 0 };

  return (
    <AnimatePresence>
      {context.open && (
        <DialogPrimitive.Portal data-slot="morphing-modal-portal" keepMounted>
          <DialogPrimitive.Backdrop
            data-slot="morphing-modal-overlay"
            render={<motion.div {...backdropMotion(reduced)} />}
            className={OVERLAY}
          />
          {/* The popup is the placing layer; it lets presses through to the
              backdrop, so a press beside the panel still dismisses. Its
              opacity is what Base UI waits on while the panel folds back. */}
          <DialogPrimitive.Popup
            data-slot="morphing-modal-content"
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
            className={cn(
              "pointer-events-none fixed inset-4 z-modal flex justify-center outline-none",
              placement === "bottom" ? "items-end" : "items-center"
            )}
            {...props}
          >
            <motion.div
              layoutId={reduced ? undefined : context.layoutId}
              layout={!reduced}
              transition={SPRING_LAYOUT}
              className={cn(
                "pointer-events-auto relative flex max-h-full w-full max-w-md flex-col overflow-hidden border border-border bg-popover text-sm text-popover-foreground shadow-2xl",
                className
              )}
              style={{ borderRadius: radius }}
            >
              <motion.div layout={reduced ? false : "position"} className="min-h-0 overflow-y-auto p-5">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={viewKey}
                    initial={
                      reduced
                        ? { opacity: 0 }
                        : { opacity: 0, y: 8, filter: "blur(4px)" }
                    }
                    animate={{
                      opacity: 1,
                      y: 0,
                      filter: "blur(0px)",
                      transition: reduced
                        ? instant
                        : { duration: 0.24, delay: 0.06, ease: EASE_OUT },
                    }}
                    exit={
                      reduced
                        ? { opacity: 0, transition: instant }
                        : {
                            opacity: 0,
                            y: -8,
                            filter: "blur(4px)",
                            transition: { duration: 0.14, ease: EASE_OUT },
                          }
                    }
                    className="grid gap-4"
                  >
                    {children}
                  </motion.div>
                </AnimatePresence>
              </motion.div>

              {showCloseButton && (
                <motion.div
                  layout={reduced ? false : "position"}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    transition: reduced
                      ? instant
                      : { delay: 0.16, duration: 0.2, ease: EASE_OUT },
                  }}
                  exit={{
                    opacity: 0,
                    transition: reduced ? instant : { duration: 0.1 },
                  }}
                  className="absolute top-3 right-3"
                >
                  <DialogPrimitive.Close
                    data-slot="morphing-modal-close"
                    render={<Button variant="ghost" size="icon-sm" />}
                  >
                    <XIcon />
                    <span className="sr-only">{labels?.close ?? "Close"}</span>
                  </DialogPrimitive.Close>
                </motion.div>
              )}
            </motion.div>
          </DialogPrimitive.Popup>
        </DialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

function MorphingModalHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="morphing-modal-header"
      className={cn("flex flex-col gap-1.5 pr-8", className)}
      {...props}
    />
  );
}

function MorphingModalTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="morphing-modal-title"
      className={cn("font-heading text-base leading-none font-medium", className)}
      {...props}
    />
  );
}

function MorphingModalDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="morphing-modal-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function MorphingModalClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="morphing-modal-close" {...props} />;
}

export {
  MorphingModal,
  MorphingModalClose,
  MorphingModalContent,
  MorphingModalDescription,
  MorphingModalHeader,
  MorphingModalTitle,
  MorphingModalTrigger,
};
