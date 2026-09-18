"use client";

/*
 * Tabs: one indicator that glides from tab to tab — a raised pill, or an
 * underline for the line variant — over Base UI's Tabs and its measured
 * indicator.
 */

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, useReducedMotion, type HTMLMotionProps } from "motion/react";

import { SPRING_LAYOUT } from "@showcase/components/ui/ai-motion";
import { cn } from "@showcase/lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list relative isolate inline-flex w-fit items-center justify-center rounded-full p-1 text-muted-foreground group-data-horizontal/tabs:h-9 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:rounded-xl data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  const reduced = useReducedMotion() ?? false;

  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    >
      {children}
      <TabsPrimitive.Indicator
        data-slot="tabs-indicator"
        className={cn(
          "absolute -z-1",
          variant === "line"
            ? "bg-foreground group-data-horizontal/tabs:bottom-0 group-data-horizontal/tabs:h-0.5 group-data-vertical/tabs:right-0 group-data-vertical/tabs:w-0.5"
            : "rounded-full bg-background shadow-sm group-data-vertical/tabs:rounded-lg dark:bg-accent"
        )}
        render={(indicatorProps, state) => {
          const position = state.activeTabPosition;
          const size = state.activeTabSize;
          const vertical = state.orientation === "vertical";
          // The pill covers the tab; the underline tracks one axis only.
          const box =
            position && size
              ? variant === "line"
                ? vertical
                  ? { top: position.top, height: size.height }
                  : { left: position.left, width: size.width }
                : {
                    top: position.top,
                    left: position.left,
                    width: size.width,
                    height: size.height,
                  }
              : { opacity: 0 };
          return (
            <motion.span
              {...(indicatorProps as HTMLMotionProps<"span">)}
              initial={false}
              animate={box}
              transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
            />
          );
        }}
      />
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent px-3 py-0.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-[color,box-shadow] duration-normal ease-standard group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start group-data-vertical/tabs:rounded-lg hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:text-foreground group-data-[variant=line]/tabs-list:rounded-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn(
        "flex-1 text-sm outline-none transition-[opacity,translate] duration-normal ease-standard starting:translate-y-1 starting:opacity-0",
        className
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
