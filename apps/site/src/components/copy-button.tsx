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
import { CheckIcon, CopyIcon } from "lucide-react";

type CopyButtonProps = React.ComponentProps<typeof Button> & {
  text: string;
  disableTooltip?: boolean;
};

export function CopyButton({
  variant = "ghost",
  size = "icon-sm",
  text,
  onClick,
  disableTooltip = false,
  ...props
}: CopyButtonProps) {
  const { copied, copy } = useCopyToClipboard();

  const handleCopy: CopyButtonProps["onClick"] = (event) => {
    copy(text);
    onClick?.(event);
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={copied ? "Copied" : "Copy to clipboard"}
            disabled={copied || props.disabled}
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
          <CopyIcon aria-hidden="true" className="size-3.5" />
        </div>
      </TooltipTrigger>
      {!disableTooltip && (
        <TooltipContent className="px-2 py-1 text-xs">
          Click to copy
        </TooltipContent>
      )}
    </Tooltip>
  );
}
