"use client";

/*
 * The popover: a rounded panel that scales
 * out of its trigger, over Base UI's Popover. shadcn base-nova's API (MIT). The panel
 * springs open with motion; the root is kept controlled so the exit plays.
 */

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { popupMotion, useOpenState } from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

const PopoverOpenContext = React.createContext<boolean | null>(null);

function Popover({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: PopoverPrimitive.Root.Props) {
  const [open, setOpen] = useOpenState(openProp, defaultOpen, onOpenChange);
  return (
    <PopoverOpenContext.Provider value={open}>
      <PopoverPrimitive.Root
        data-slot="popover"
        open={open}
        onOpenChange={setOpen}
        {...props}
      />
    </PopoverOpenContext.Provider>
  );
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 6,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  const open = React.useContext(PopoverOpenContext) ?? true;
  const reduced = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {open && (
        <PopoverPrimitive.Portal keepMounted>
          <PopoverPrimitive.Positioner
            align={align}
            alignOffset={alignOffset}
            side={side}
            sideOffset={sideOffset}
            className="isolate z-popover"
          >
            <PopoverPrimitive.Popup
              data-slot="popover-content"
              render={<motion.div {...popupMotion(reduced)} />}
              className={cn(
                "flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-lg outline-hidden",
                className
              )}
              {...props}
            />
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
