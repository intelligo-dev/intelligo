"use client";

/*
 * The switch: a weighted thumb that glides across and squeezes while
 * pressed.
 */

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { cn } from "@showcase/lib/utils";

// Travel of the thumb across the track, per size.
const TRAVEL = { default: 16, sm: 12 } as const;

// A thumb that overshoots a touch and settles.
const THUMB_SPRING = {
  type: "spring",
  stiffness: 600,
  damping: 32,
  mass: 0.6,
} as const;

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & {
  size?: "sm" | "default";
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent p-0.5 transition-[background-color,box-shadow] duration-normal ease-standard outline-none group-has-[:focus-visible]/field-label:border-transparent group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-5 data-[size=default]:w-9 data-[size=sm]:h-4 data-[size=sm]:w-7 data-checked:bg-primary data-unchecked:bg-muted-foreground/40 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background shadow-sm ring-0 transition-[scale] duration-slow ease-emphasized group-active/switch:scale-x-115 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-checked:origin-right data-unchecked:origin-left"
        render={(thumbProps, state) => (
          <motion.span
            {...(thumbProps as HTMLMotionProps<"span">)}
            initial={false}
            animate={{ x: state.checked ? TRAVEL[size] : 0 }}
            transition={reduced ? { duration: 0 } : THUMB_SPRING}
          />
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
