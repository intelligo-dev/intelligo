"use client";

/*
 * The alert dialog: the dialog's backdrop and
 * spring, for a decision the reader must make, over Base UI's AlertDialog.
 * shadcn base-nova's API (MIT). Backdrop and panel animate with motion; the root is
 * kept controlled so the exit plays.
 */

import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  backdropMotion,
  popupMotion,
  useOpenState,
} from "@/components/ui/ai-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const AlertDialogOpenContext = React.createContext<boolean | null>(null);

const OVERLAY =
  "fixed inset-0 isolate z-overlay bg-background/60 supports-backdrop-filter:backdrop-blur-sm";

function AlertDialog({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: AlertDialogPrimitive.Root.Props) {
  const [open, setOpen] = useOpenState(openProp, defaultOpen, onOpenChange);
  return (
    <AlertDialogOpenContext.Provider value={open}>
      <AlertDialogPrimitive.Root
        data-slot="alert-dialog"
        open={open}
        onOpenChange={setOpen}
        {...props}
      />
    </AlertDialogOpenContext.Provider>
  );
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        OVERLAY,
        "transition-[opacity,backdrop-filter] duration-normal ease-standard data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-fast",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  size?: "default" | "sm";
}) {
  const open = React.useContext(AlertDialogOpenContext) ?? true;
  const reduced = useReducedMotion() ?? false;

  return (
    <AnimatePresence>
      {open && (
        <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" keepMounted>
          <AlertDialogPrimitive.Backdrop
            data-slot="alert-dialog-overlay"
            render={<motion.div {...backdropMotion(reduced)} />}
            className={OVERLAY}
          />
          <AlertDialogPrimitive.Popup
            data-slot="alert-dialog-content"
            data-size={size}
            render={<motion.div {...popupMotion(reduced, 0.94)} />}
            className={cn(
              "group/alert-dialog-content fixed top-1/2 left-1/2 z-modal grid w-full -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl outline-none data-[size=default]:max-w-xs data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-sm",
              className
            )}
            {...props}
          />
        </AlertDialogPrimitive.Portal>
      )}
    </AnimatePresence>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-4 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-2xl border-t bg-muted/60 px-5 py-4 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 items-center justify-center rounded-xl bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "font-heading text-base font-medium sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-sm text-balance text-muted-foreground md:text-pretty *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="alert-dialog-action"
      className={cn(className)}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
