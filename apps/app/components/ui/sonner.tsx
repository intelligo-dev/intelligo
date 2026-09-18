"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
  XIcon,
} from "lucide-react";

/*
 * Sonner, drawn as a stack of rounded cards: each toast behind the front
 * one peeks out a little lower and a little smaller, the status sits in a
 * tinted round chip, and every move settles on a long ease-out that reads
 * as a spring. Toasts are unstyled so the classes below own the surface;
 * Sonner still owns stacking, swipe and timing, and its own
 * prefers-reduced-motion rule still turns the motion off.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      gap={10}
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4 text-info" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin text-muted-foreground" />,
        close: <XIcon className="size-3.5" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-2xl)",
        } as React.CSSProperties
      }
      toastOptions={{
        unstyled: true,
        style: {
          transitionDuration: "450ms",
          transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
        },
        classNames: {
          toast:
            "cn-toast group/toast flex w-(--width) items-center gap-3 rounded-2xl border border-border bg-popover/95 p-3 font-sans text-popover-foreground shadow-2xl backdrop-blur-xl outline-none focus-visible:ring-2 focus-visible:ring-ring has-[[data-description]]:items-start data-[expanded=false]:data-[front=false]:*:opacity-0",
          icon: "relative grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground group-data-[type=success]/toast:bg-success/10 group-data-[type=info]/toast:bg-info/10 group-data-[type=warning]/toast:bg-warning/10 group-data-[type=error]/toast:bg-destructive/10",
          content: "flex min-w-0 flex-1 flex-col gap-0.5",
          title: "text-sm leading-5 font-medium text-popover-foreground",
          description: "line-clamp-2 text-xs leading-4 text-muted-foreground",
          actionButton:
            "inline-flex h-7 shrink-0 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/88 focus-visible:ring-2 focus-visible:ring-ring outline-none",
          cancelButton:
            "inline-flex h-7 shrink-0 items-center rounded-full bg-muted px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none",
          closeButton:
            "order-last grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring outline-none",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
