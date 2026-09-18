"use client";

/*
 * The radio group: the dot springs out from
 * the centre, over Base UI's RadioGroup. shadcn base-nova's API (MIT).
 */

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { motion, useReducedMotion } from "motion/react";

import { SPRING_PRESS } from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("grid w-full gap-2", className)}
      {...props}
    />
  );
}

function RadioGroupItem({ className, ...props }: RadioPrimitive.Root.Props) {
  const reduced = useReducedMotion() ?? false;

  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={cn(
        "group/radio-group-item peer relative flex aspect-square size-4 shrink-0 rounded-full border border-input bg-card transition-[background-color,border-color,box-shadow,scale] duration-fast ease-standard outline-none group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-92 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        keepMounted
        className="flex size-4 items-center justify-center"
        render={(indicatorProps, state) => (
          <span {...indicatorProps}>
            {/* The dot pops in on a spring and shrinks away when cleared. */}
            <motion.span
              className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground"
              initial={false}
              animate={{ scale: state.checked ? 1 : 0 }}
              transition={reduced ? { duration: 0 } : SPRING_PRESS}
            />
          </span>
        )}
      />
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, RadioGroupItem };
