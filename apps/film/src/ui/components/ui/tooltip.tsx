"use client";

/*
 * The tooltip: a light surface that grows out of its trigger and blurs in;
 * once one has shown, the provider opens neighbouring tooltips instantly.
 */

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";

import { cn } from "@ui/lib/utils";

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

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
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
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-popover"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-lg border border-border bg-popover px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-lg transition-[opacity,scale,filter] duration-normal ease-standard has-data-[slot=kbd]:pr-1 data-instant:duration-0 data-starting-style:scale-90 data-starting-style:opacity-0 data-starting-style:blur-xs data-ending-style:scale-95 data-ending-style:opacity-0 data-ending-style:duration-fast",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
