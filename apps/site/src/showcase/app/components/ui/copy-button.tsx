"use client";

import * as React from "react";
import { CheckIcon, CopyIcon } from "lucide-react";

import { Button } from "@showcase/components/ui/button";

type CopyButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "onClick" | "value"
> & {
  /** The text written to the clipboard. */
  value: string;
  /** Accessible name before copying — pass translated copy. */
  label: string;
  /** Announced once the text is on the clipboard. */
  copiedLabel: string;
  onCopy?: () => void;
  onCopyError?: (error: unknown) => void;
  /** How long the confirmation shows, in milliseconds. */
  timeout?: number;
};

/**
 * Copy with confirmation, the same everywhere. The
 * icon swaps and a polite live region announces the copy; failures go to
 * `onCopyError` so the caller decides whether to toast.
 */
function CopyButton({
  value,
  label,
  copiedLabel,
  onCopy,
  onCopyError,
  timeout = 2000,
  variant = "ghost",
  size = "icon-sm",
  children,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), timeout);
    return () => clearTimeout(timer);
  }, [copied, timeout]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopy?.();
    } catch (error) {
      onCopyError?.(error);
    }
  }

  return (
    <Button
      data-slot="copy-button"
      data-copied={copied || undefined}
      variant={variant}
      size={size}
      aria-label={children ? undefined : copied ? copiedLabel : label}
      onClick={copy}
      {...props}
    >
      {copied ? (
        <CheckIcon data-icon="inline-start" />
      ) : (
        <CopyIcon data-icon="inline-start" />
      )}
      {children}
      <span aria-live="polite" className="sr-only">
        {copied ? copiedLabel : ""}
      </span>
    </Button>
  );
}

export { CopyButton };
