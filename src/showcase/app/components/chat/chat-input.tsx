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
}

export function ChatInput({ onSend, onStop, isStreaming }: ChatInputProps) {
  const t = useTranslations("chat");
  const [value, setValue] = useState("");

  function submit() {
    const text = value.trim();
    if (!text || isStreaming) return;
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
          placeholder={t("input.placeholder")}
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
            disabled={!value.trim()}
            aria-label={t("input.send")}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
