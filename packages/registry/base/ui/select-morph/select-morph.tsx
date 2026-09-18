"use client";

/*
 * A select whose trigger grows into its list: the list opens flush under
 * the trigger, the trigger's lower corners square off to meet it, and the
 * list unclips downward as one continuous surface while its options
 * stagger in.
 */

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  EASE_IN_OUT,
  EASE_OUT,
  SPRING_SWAP,
  listItem,
  listStagger,
  useOpenState,
} from "@/components/ui/ai-motion";
import { cn } from "@/lib/utils";

// A select's popup mounts on first open and then stays in the DOM, so the
// list animates with presence until then and with open state after.
type MorphSelectPresence = {
  open: boolean;
  mounted: boolean;
  markMounted: () => void;
};

const MorphSelectContext = React.createContext<MorphSelectPresence | null>(
  null
);

const RADIUS = 12;
// The list is revealed from the trigger's edge down; the clip-path tweens
// rather than springs, so it cannot snap as a spring resolves.
const CLIP_HIDDEN = `inset(0% 0% 100% 0% round 0px 0px ${RADIUS}px ${RADIUS}px)`;
const CLIP_SHOWN = `inset(0% 0% 0% 0% round 0px 0px ${RADIUS}px ${RADIUS}px)`;

function MorphSelect<Value, Multiple extends boolean | undefined = false>({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  const [open, setOpen] = useOpenState(openProp, defaultOpen, onOpenChange);
  const [mounted, setMounted] = React.useState(false);
  const markMounted = React.useCallback(() => setMounted(true), []);
  const presence = React.useMemo(
    () => ({ open, mounted, markMounted }),
    [open, mounted, markMounted]
  );

  return (
    <MorphSelectContext.Provider value={presence}>
      <SelectPrimitive.Root open={open} onOpenChange={setOpen} {...props} />
    </MorphSelectContext.Provider>
  );
}

function MorphSelectValue({
  className,
  ...props
}: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="morph-select-value"
      className={cn(
        "min-w-0 flex-1 truncate text-left data-placeholder:text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

/** The trigger; the list opens as its continuation. Usually holds a MorphSelectValue. */
function MorphSelectTrigger({
  className,
  children,
  ...props
}: SelectPrimitive.Trigger.Props) {
  const reduced = useReducedMotion() ?? false;
  const open = React.useContext(MorphSelectContext)?.open ?? false;

  return (
    <SelectPrimitive.Trigger
      data-slot="morph-select-trigger"
      className={cn(
        "flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-border bg-popover px-3.5 text-sm text-foreground outline-none select-none transition-[border-radius,border-color,box-shadow] duration-normal ease-standard hover:border-ring/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-popup-open:rounded-b-none data-popup-open:hover:border-border motion-reduce:transition-none",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <motion.span
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduced ? { duration: 0 } : SPRING_SWAP}
            className="flex text-muted-foreground"
          />
        }
      >
        <ChevronDownIcon className="pointer-events-none size-4" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export type MorphSelectContentProps = SelectPrimitive.Popup.Props;

/** The list, unclipping from the trigger's lower edge. */
function MorphSelectContent({
  className,
  children,
  ...props
}: MorphSelectContentProps) {
  const presence = React.useContext(MorphSelectContext);
  const open = presence?.open ?? true;
  const mounted = presence?.mounted ?? false;
  const markMounted = presence?.markMounted;
  const positionerRef = React.useCallback(() => markMounted?.(), [markMounted]);
  const reduced = useReducedMotion() ?? false;

  // Opacity rides along with the clip: Base UI reads it to know when the
  // close has finished.
  const shown = {
    opacity: 1,
    clipPath: CLIP_SHOWN,
    transition: {
      clipPath: { duration: reduced ? 0 : 0.32, ease: EASE_OUT },
      opacity: { duration: reduced ? 0 : 0.12, ease: EASE_OUT },
    },
  };
  const hidden = {
    opacity: 0,
    clipPath: reduced ? CLIP_SHOWN : CLIP_HIDDEN,
    transition: {
      clipPath: { duration: reduced ? 0 : 0.22, ease: EASE_IN_OUT },
      opacity: { duration: reduced ? 0 : 0.22, ease: EASE_IN_OUT },
    },
  };

  return (
    <AnimatePresence>
      {(open || mounted) && (
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner
            ref={positionerRef}
            side="bottom"
            align="start"
            // Overlap the trigger's lower border, so the two read as one edge.
            sideOffset={-1}
            alignItemWithTrigger={false}
            // Never flip above: the list only ever continues the trigger down.
            collisionAvoidance={{ side: "none", align: "shift" }}
            className="isolate z-popover"
          >
            <SelectPrimitive.Popup
              data-slot="morph-select-content"
              render={
                mounted ? (
                  <motion.div
                    initial={false}
                    animate={open ? shown : hidden}
                  />
                ) : (
                  <motion.div initial={hidden} animate={shown} exit={hidden} />
                )
              }
              className={cn(
                "max-h-(--available-height) w-(--anchor-width) overflow-x-hidden overflow-y-auto rounded-b-xl border border-border bg-popover text-popover-foreground shadow-lg outline-none",
                className
              )}
              {...props}
            >
              <SelectPrimitive.List
                render={
                  <motion.div
                    variants={reduced ? undefined : listStagger}
                    initial="hidden"
                    animate={open ? "shown" : "hidden"}
                  />
                }
                className="p-1"
              >
                {children}
              </SelectPrimitive.List>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

function MorphSelectItem({
  className,
  children,
  ...props
}: SelectPrimitive.Item.Props) {
  const reduced = useReducedMotion() ?? false;

  return (
    <SelectPrimitive.Item
      data-slot="morph-select-item"
      render={<motion.div variants={reduced ? undefined : listItem} />}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-lg py-1.5 pr-8 pl-2.5 text-sm text-muted-foreground outline-none select-none transition-colors duration-fast data-highlighted:bg-muted data-highlighted:text-foreground data-selected:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="min-w-0 flex-1 truncate">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex items-center">
        <CheckIcon className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

function MorphSelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="morph-select-group"
      className={cn("py-0.5", className)}
      {...props}
    />
  );
}

function MorphSelectLabel({
  className,
  ...props
}: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="morph-select-label"
      className={cn("px-2.5 py-1 text-xs text-muted-foreground", className)}
      {...props}
    />
  );
}

function MorphSelectSeparator({
  className,
  ...props
}: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="morph-select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  );
}

export {
  MorphSelect,
  MorphSelectContent,
  MorphSelectGroup,
  MorphSelectItem,
  MorphSelectLabel,
  MorphSelectSeparator,
  MorphSelectTrigger,
  MorphSelectValue,
};
