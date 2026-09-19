"use client";

import * as React from "react";
import { BrainIcon, ChevronDownIcon } from "lucide-react";
import { Streamdown } from "streamdown";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@showcase/components/ui/collapsible";
import { cn } from "@showcase/lib/utils";

const AUTO_CLOSE_DELAY = 1000;

type ReasoningContextValue = {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
};

const ReasoningContext = React.createContext<ReasoningContextValue | null>(
  null
);

function useReasoning() {
  const context = React.useContext(ReasoningContext);
  if (!context) {
    throw new Error("Reasoning components must be used within Reasoning");
  }
  return context;
}

function Reasoning({
  className,
  isStreaming = false,
  open,
  defaultOpen = true,
  onOpenChange,
  duration: durationProp,
  children,
  ...props
}: Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "defaultOpen" | "onOpenChange"
> & {
  isStreaming?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Seconds spent reasoning, when the caller already knows it. */
  duration?: number;
}) {
  const [openState, setOpenState] = React.useState(defaultOpen);
  const isOpen = open ?? openState;
  const setIsOpen = React.useCallback(
    (next: boolean) => {
      if (open === undefined) setOpenState(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange]
  );

  const [measured, setMeasured] = React.useState<number | undefined>();
  const duration = durationProp ?? measured;
  const startedAt = React.useRef<number | null>(null);
  const [hasAutoClosed, setHasAutoClosed] = React.useState(false);

  React.useEffect(() => {
    if (isStreaming) {
      if (startedAt.current === null) startedAt.current = Date.now();
    } else if (startedAt.current !== null) {
      setMeasured(Math.ceil((Date.now() - startedAt.current) / 1000));
      startedAt.current = null;
    }
  }, [isStreaming]);

  // Open while streaming; close once, shortly after it ends.
  React.useEffect(() => {
    if (defaultOpen && !isStreaming && isOpen && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, AUTO_CLOSE_DELAY);
      return () => clearTimeout(timer);
    }
  }, [defaultOpen, isStreaming, isOpen, hasAutoClosed, setIsOpen]);

  return (
    <ReasoningContext.Provider
      value={{ isStreaming, isOpen, setIsOpen, duration }}
    >
      <Collapsible
        data-slot="reasoning"
        className={className}
        open={isOpen}
        onOpenChange={(next) => setIsOpen(next)}
        {...props}
      >
        {children}
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

function ReasoningTrigger({
  className,
  children,
  getThinkingMessage,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  /** The translated status line: "Thinking…" while streaming, "Thought for 3 seconds" after. */
  getThinkingMessage?: (
    isStreaming: boolean,
    duration?: number
  ) => React.ReactNode;
}) {
  const { isStreaming, isOpen, duration } = useReasoning();

  return (
    <CollapsibleTrigger
      data-slot="reasoning-trigger"
      className={cn(
        "flex w-full items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
        className
      )}
      {...props}
    >
      {children ?? (
        <>
          <BrainIcon className="size-4" />
          <span className={cn(isStreaming && "shimmer")}>
            {getThinkingMessage?.(isStreaming, duration)}
          </span>
          <ChevronDownIcon
            className={cn(
              "size-4 transition-transform",
              isOpen && "rotate-180"
            )}
          />
        </>
      )}
    </CollapsibleTrigger>
  );
}

function ReasoningContent({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof CollapsibleContent>, "children"> & {
  children: string;
}) {
  return (
    <CollapsibleContent
      data-slot="reasoning-content"
      className={cn("mt-3 text-sm text-muted-foreground", className)}
      {...props}
    >
      <Streamdown>{children}</Streamdown>
    </CollapsibleContent>
  );
}

export { Reasoning, ReasoningTrigger, ReasoningContent, useReasoning };
