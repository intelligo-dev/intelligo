"use client";

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslations } from "use-intl";
import { ArrowUp, Square } from "lucide-react";

import { Button } from "@showcase/components/ui/button";
import { Textarea } from "@showcase/components/ui/textarea";

interface ChatInputProps {
  onSend: (text: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  /**
   * Stops the composer accepting a turn that will be refused — out of
   * credits, or behind a feature gate. The banner above says why; this
   * is what keeps someone from writing a paragraph into a request the
   * route has already told us it will reject.
   */
  disabled?: boolean;
  /** Placeholder to show instead of the usual one while disabled. */
  disabledPlaceholder?: string;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
  disabledPlaceholder,
}: ChatInputProps) {
  const t = useTranslations("chat");
  const [value, setValue] = useState("");

  function submit() {
    const text = value.trim();
    if (!text || isStreaming || disabled) return;
    onSend(text);
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t bg-background px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            disabled && disabledPlaceholder
              ? disabledPlaceholder
              : t("input.placeholder")
          }
          rows={1}
          className="max-h-40 min-h-10 flex-1 resize-none"
        />
        {isStreaming ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={onStop}
            aria-label={t("input.stop")}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            onClick={submit}
            disabled={disabled || !value.trim()}
            aria-label={t("input.send")}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
