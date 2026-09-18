"use client";

/*
 * The checkbox: the box fills and the check draws itself in.
 */

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";

import { cn } from "@ui/lib/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-sm border border-input bg-card transition-[background-color,border-color,box-shadow,scale] duration-fast ease-standard outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:ring-0 group-has-[:focus-visible]/field-label:not-data-checked:border-input after:absolute after:-inset-x-3 after:-inset-y-2 hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-92 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground group-has-[:focus-visible]/field-label:data-checked:border-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        keepMounted
        className="group/checkbox-indicator grid place-content-center text-current"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="size-3.5"
        >
          <path
            d="M5 13l4 4L19 7"
            pathLength={1}
            className="transition-[stroke-dashoffset] duration-normal ease-standard [stroke-dasharray:1] [stroke-dashoffset:1] group-data-checked/checkbox-indicator:[stroke-dashoffset:0] group-data-indeterminate/checkbox-indicator:hidden"
          />
          <path
            d="M6 12h12"
            className="hidden group-data-indeterminate/checkbox-indicator:block"
          />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
