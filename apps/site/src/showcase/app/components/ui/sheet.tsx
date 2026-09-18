"use client";

/*
 * The sheet: a panel that slides in from an edge on the drawer curve over
 * a blurred backdrop. Backdrop and panel animate with motion; the root is
 * kept controlled so the exit plays.
 */

import * as React from "react";
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  backdropMotion,
  EASE_DRAWER,
  EASE_IN_OUT,
  useOpenState,
} from "@showcase/components/ui/ai-motion";
import { Button } from "@showcase/components/ui/button";
import { cn } from "@showcase/lib/utils";

const SheetOpenContext = React.createContext<boolean | null>(null);

const OVERLAY =
  "fixed inset-0 isolate z-overlay bg-background/60 supports-backdrop-filter:backdrop-blur-sm";

type Side = "top" | "right" | "bottom" | "left";

const OFFSCREEN: Record<Side, { x?: string; y?: string }> = {
  top: { y: "-100%" },
  right: { x: "100%" },
  bottom: { y: "100%" },
  left: { x: "-100%" },
};

// The panel travels on the drawer curve and fades with it, so Base UI sees
// an opacity animation and waits for the slide before it hides the panel.
function sheetMotion(side: Side, reduced: boolean) {
  if (reduced) {
    return {
      initial: { opacity: 0 },
      animate: { opacity: 1, transition: { duration: 0 } },
      exit: { opacity: 0, transition: { duration: 0 } },
    } as const;
  }
  return {
    initial: { opacity: 0, ...OFFSCREEN[side] },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: { duration: 0.42, ease: EASE_DRAWER },
    },
    exit: {
      opacity: 0,
      ...OFFSCREEN[side],
      transition: {
        duration: 0.26,
        ease: EASE_IN_OUT,
        opacity: { duration: 0.26, ease: "easeIn" },
      },
    },
  } as const;
}

function Sheet({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: SheetPrimitive.Root.Props) {
  const [open, setOpen] = useOpenState(openProp, defaultOpen, onOpenChange);
  return (
    <SheetOpenContext.Provider value={open}>
      <SheetPrimitive.Root
        data-slot="sheet"
        open={open}
        onOpenChange={setOpen}
        {...props}
      />
    </SheetOpenContext.Provider>
  );
}

function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: Side;
  showCloseButton?: boolean;
}) {
  const open = React.useContext(SheetOpenContext) ?? true;
  const reduced = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {open && (
        <SheetPrimitive.Portal data-slot="sheet-portal" keepMounted>
          <SheetPrimitive.Backdrop
            data-slot="sheet-overlay"
            render={<motion.div {...backdropMotion(reduced)} />}
            className={OVERLAY}
          />
          <SheetPrimitive.Popup
            data-slot="sheet-content"
            data-side={side}
            render={<motion.div {...sheetMotion(side, reduced)} />}
            className={cn(
              "fixed z-modal flex flex-col gap-4 bg-popover bg-clip-padding text-sm text-popover-foreground shadow-2xl data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=bottom]:rounded-t-2xl data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=top]:rounded-b-2xl data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
              className
            )}
            {...props}
          >
            {children}
            {showCloseButton && (
              <SheetPrimitive.Close
                data-slot="sheet-close"
                render={
                  <Button
                    variant="ghost"
                    className="absolute top-3 right-3"
                    size="icon-sm"
                  />
                }
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </SheetPrimitive.Close>
            )}
          </SheetPrimitive.Popup>
        </SheetPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn(
        "font-heading text-base font-medium text-foreground",
        className
      )}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
