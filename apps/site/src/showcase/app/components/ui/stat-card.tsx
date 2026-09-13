import * as React from "react";

import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@showcase/components/ui/card";
import { cn } from "@showcase/lib/utils";

/**
 * A metric on a card (ADR-0013 §6, T4): a label, the value, an optional
 * action such as a status badge, and a footer for context. Composed from
 * Card so it follows whatever the consumer's card looks like.
 */
function StatCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      data-slot="stat-card"
      className={cn("@container/stat-card", className)}
      {...props}
    />
  );
}

function StatCardHeader(props: React.ComponentProps<typeof CardHeader>) {
  return <CardHeader data-slot="stat-card-header" {...props} />;
}

function StatCardLabel(props: React.ComponentProps<typeof CardDescription>) {
  return <CardDescription data-slot="stat-card-label" {...props} />;
}

function StatCardValue({
  className,
  ...props
}: React.ComponentProps<typeof CardTitle>) {
  return (
    <CardTitle
      data-slot="stat-card-value"
      className={cn(
        "text-2xl font-semibold tracking-tight tabular-nums @[16rem]/stat-card:text-3xl",
        className
      )}
      {...props}
    />
  );
}

function StatCardAction(props: React.ComponentProps<typeof CardAction>) {
  return <CardAction data-slot="stat-card-action" {...props} />;
}

function StatCardFooter({
  className,
  ...props
}: React.ComponentProps<typeof CardFooter>) {
  return (
    <CardFooter
      data-slot="stat-card-footer"
      className={cn(
        "flex-col items-start gap-1 text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export {
  StatCard,
  StatCardHeader,
  StatCardLabel,
  StatCardValue,
  StatCardAction,
  StatCardFooter,
};
