"use client";
import { cn } from "@/lib/utils";
import type React from "react";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckIcon, CopyIcon, XIcon } from "lucide-react";

type CopyButtonProps = React.ComponentProps<typeof Button> & {
  text: string;
  disableTooltip?: boolean;
};

export function CopyButton({
  variant = "ghost",
  size = "icon",
  text,
  onClick,
  disableTooltip = false,
  ...props
}: CopyButtonProps) {
  const { copied, failed, copy } = useCopyToClipboard();
  const status = copied
    ? "Copied"
    : failed
      ? "Copy failed — select the text instead"
      : "";

  const handleCopy: CopyButtonProps["onClick"] = (event) => {
    copy(text);
    onClick?.(event);
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            // never disabled on success: a disabled button drops keyboard
            // focus to <body>, and the reader starts the page over
            aria-label="Copy to clipboard"
            onClick={handleCopy}
            size={size}
            variant={variant}
            {...props}
          />
        }
      >
        <div
          className={cn(
            "transition-[scale,opacity,filter] duration-normal ease-standard",
            copied
              ? "scale-100 opacity-100 blur-none"
              : "scale-50 opacity-0 blur-xs"
          )}
        >
          <CheckIcon aria-hidden="true" className="size-3.5 stroke-success" />
        </div>
        <div
          className={cn(
            "absolute transition-[scale,opacity,filter] duration-normal ease-standard",
            copied
              ? "scale-50 opacity-0 blur-xs"
              : "scale-100 opacity-100 blur-none"
          )}
        >
          {failed ? (
            <XIcon aria-hidden="true" className="size-3.5 stroke-destructive" />
          ) : (
            <CopyIcon aria-hidden="true" className="size-3.5" />
          )}
        </div>
        <span className="sr-only" role="status">
          {status}
        </span>
      </TooltipTrigger>
      {!disableTooltip && (
        <TooltipContent className="px-2 py-1 text-xs">
          Click to copy
        </TooltipContent>
      )}
    </Tooltip>
  );
}
