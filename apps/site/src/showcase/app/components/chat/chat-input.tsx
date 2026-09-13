"use client";

/**
 * The composer, on the T3 prompt input (ADR-0013): an autosizing
 * textarea that sends on Enter and a submit that becomes stop while a
 * reply streams.
 */

import { useState } from "react";
import { useTranslations } from "use-intl";

import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@showcase/components/ui/ai-prompt-input";

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
  const placeholder =
    disabled && disabledPlaceholder
      ? disabledPlaceholder
      : t("input.placeholder");

  return (
    <div className="bg-background px-4 pt-2 pb-4">
      <PromptInput
        className="mx-auto max-w-3xl"
        onSubmit={({ text }) => {
          const trimmed = text.trim();
          if (!trimmed || isStreaming || disabled) return;
          onSend(trimmed);
          setValue("");
        }}
      >
        <PromptInputTextarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit
            status={isStreaming ? "streaming" : "ready"}
            label={isStreaming ? t("input.stop") : t("input.send")}
            disabled={!isStreaming && (disabled || !value.trim())}
            onClick={isStreaming ? onStop : undefined}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
