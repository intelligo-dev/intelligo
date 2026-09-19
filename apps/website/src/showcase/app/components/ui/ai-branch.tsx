"use client";

/*
 * For a thread that owns which version is on screen: this is a pager over
 * versions the thread keeps, not a component that clones its children per
 * branch.
 */

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@showcase/components/ui/button";
import { cn } from "@showcase/lib/utils";

type BranchContextValue = {
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
};

const BranchContext = React.createContext<BranchContextValue | null>(null);

function useBranch() {
  const context = React.useContext(BranchContext);
  if (!context) {
    throw new Error("Branch components must be used within Branch");
  }
  return context;
}

/**
 * Versions of one reply — or one edited message — with the thread in
 * charge of `index`. Renders nothing when there is only one.
 */
function Branch({
  index,
  count,
  onIndexChange,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  /** Zero-based; the version on screen. */
  index: number;
  count: number;
  onIndexChange: (index: number) => void;
}) {
  const value = React.useMemo(
    () => ({ index, count, onIndexChange }),
    [index, count, onIndexChange]
  );
  if (count < 2) return null;
  return (
    <BranchContext.Provider value={value}>
      <div
        data-slot="branch"
        className={cn("flex items-center gap-0.5", className)}
        {...props}
      >
        {children}
      </div>
    </BranchContext.Provider>
  );
}

function BranchPrevious({
  label,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  /** Accessible name, e.g. "Previous version". */
  label: string;
}) {
  const { index, onIndexChange } = useBranch();
  return (
    <Button
      data-slot="branch-previous"
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      disabled={index <= 0}
      onClick={() => onIndexChange(index - 1)}
      className={cn("text-muted-foreground", className)}
      {...props}
    >
      <ChevronLeftIcon />
    </Button>
  );
}

function BranchNext({
  label,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "onClick"> & {
  /** Accessible name, e.g. "Next version". */
  label: string;
}) {
  const { index, count, onIndexChange } = useBranch();
  return (
    <Button
      data-slot="branch-next"
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      disabled={index >= count - 1}
      onClick={() => onIndexChange(index + 1)}
      className={cn("text-muted-foreground", className)}
      {...props}
    >
      <ChevronRightIcon />
    </Button>
  );
}

/** "2 / 3". Digits only, so it needs no copy. */
function BranchPage({ className, ...props }: React.ComponentProps<"span">) {
  const { index, count } = useBranch();
  return (
    <span
      data-slot="branch-page"
      className={cn(
        "min-w-8 text-center text-xs tabular-nums text-muted-foreground",
        className
      )}
      aria-live="polite"
      {...props}
    >
      {index + 1} / {count}
    </span>
  );
}

export { Branch, BranchPrevious, BranchNext, BranchPage, useBranch };
