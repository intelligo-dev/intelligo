"use client";

/*
 * The tooltip: a light surface that grows
 * out of its trigger and blurs in, over Base UI's Tooltip — whose provider
 * opens neighbouring tooltips instantly once one has shown. shadcn
 * base-nova's API (MIT). It springs open with motion; the root is kept controlled so
 * the exit plays.
 */

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { popupMotion, useOpenState } from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

const TooltipOpenContext = React.createContext<boolean | null>(null);

function TooltipProvider({
  delay = 120,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  );
}

function Tooltip({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: TooltipPrimitive.Root.Props) {
  const [open, setOpen] = useOpenState(openProp, defaultOpen, onOpenChange);
  return (
    <TooltipOpenContext.Provider value={open}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={open}
        onOpenChange={setOpen}
        {...props}
      />
    </TooltipOpenContext.Provider>
  );
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const open = React.useContext(TooltipOpenContext) ?? true;
  const reduced = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {open && (
        <TooltipPrimitive.Portal keepMounted>
          <TooltipPrimitive.Positioner
            align={align}
            alignOffset={alignOffset}
            side={side}
            sideOffset={sideOffset}
            className="isolate z-popover"
          >
            <TooltipPrimitive.Popup
              data-slot="tooltip-content"
              render={<motion.div {...popupMotion(reduced, 0.88)} />}
              className={cn(
                "inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-lg border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-lg has-data-[slot=kbd]:pr-1",
                className
              )}
              {...props}
            >
              {children}
            </TooltipPrimitive.Popup>
          </TooltipPrimitive.Positioner>
        </TooltipPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
