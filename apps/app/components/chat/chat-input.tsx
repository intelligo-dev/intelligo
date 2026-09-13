"use client";

/**
 * The composer, on the T3 prompt input (ADR-0013): an autosizing
 * textarea that sends on Enter, attachments by "+" / paste / drop when
 * `chatConfig.attachments` allows them, a model picker when the page
 * offers more than one, and a submit that becomes stop while a reply
 * streams. The draft is the thread's, so nothing typed is lost to a
 * model switch or a navigation.
 *
 * ArrowUp in an empty composer loads the last message the reader sent,
 * to edit and re-send — the shell habit a chat inherits.
 */

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { FileUIPart } from "ai";

import type { ChatModelOption } from "@intelligo-dev/chat/client";

import { ComposerMenu } from "@/components/ui/ai-composer-menu";
import { SpeechInput } from "@/components/ui/ai-speech-input";
import { useComposerMenu } from "@/hooks/use-composer-menu";

import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputError,
} from "@/components/ui/ai-prompt-input";
import { chatConfig, type ChatMention } from "@/lib/chat-config";

interface ChatInputProps {
  conversationId: string;
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string, files: FileUIPart[], mentions: ChatMention[]) => void;
  onStop: () => void;
  onEditLast?: () => void;
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
  models?: ChatModelOption[];
  modelId?: string;
  onModelChange?: (modelId: string) => void;
  autoFocus?: boolean;
  compact?: boolean;
}

const DEFAULT_UPLOAD_URL = "/api/chat/upload";

/** In `stored` mode a picked file uploads first; the message carries its app URL. */
async function upload(
  file: FileUIPart,
  uploadUrl: string
): Promise<FileUIPart> {
  const blob = await (await fetch(file.url)).blob();
  const form = new FormData();
  form.set("file", blob, file.filename ?? "file");
  const response = await fetch(uploadUrl, { method: "POST", body: form });
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  const result = (await response.json()) as {
    url: string;
    mediaType: string;
    filename: string;
  };
  return {
    type: "file",
    url: result.url,
    mediaType: result.mediaType,
    filename: result.filename,
  };
}

export function ChatInput({
  conversationId,
  value,
  onChange,
  onSend,
  onStop,
  onEditLast,
  isStreaming,
  disabled = false,
  disabledPlaceholder,
  models = [],
  modelId,
  onModelChange,
  autoFocus = false,
  compact = false,
}: ChatInputProps) {
  const t = useTranslations("chat");
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachments = chatConfig.attachments;
  const placeholder =
    disabled && disabledPlaceholder
      ? disabledPlaceholder
      : t("input.placeholder");

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const menu = useComposerMenu({
    value,
    setValue: onChange,
    conversationId,
    send: (text) => onSend(text, [], []),
    textareaRef,
  });

  function reportError(error: PromptInputError) {
    if (error.code === "max_files") {
      toast.error(t("attachments.tooMany", { max: attachments?.maxFiles ?? 1 }));
    } else if (error.code === "max_file_size") {
      toast.error(t("attachments.tooLarge"));
    } else {
      toast.error(t("attachments.unsupported"));
    }
  }

  return (
    <div className={compact ? "bg-background p-3 pt-2" : "bg-background px-4 pt-2 pb-4"}>
      <PromptInput
        className={compact ? "w-full" : "mx-auto max-w-3xl"}
        accept={attachments?.accept.join(",")}
        multiple={(attachments?.maxFiles ?? 1) !== 1}
        maxFiles={attachments?.maxFiles}
        maxFileSize={attachments?.maxBytes}
        globalDrop={Boolean(attachments) && !compact}
        onError={reportError}
        onSubmit={async ({ text, files }) => {
          const trimmed = text.trim();
          if ((!trimmed && files.length === 0) || isStreaming || disabled) {
            return;
          }
          let parts = files;
          if (attachments?.mode === "stored" && files.length > 0) {
            setUploading(true);
            try {
              parts = await Promise.all(
                files.map((file) =>
                  upload(file, attachments.uploadUrl ?? DEFAULT_UPLOAD_URL)
                )
              );
            } catch {
              toast.error(t("attachments.uploadFailed"));
              throw new Error("upload failed");
            } finally {
              setUploading(false);
            }
          }
          onSend(trimmed, parts, menu.mentions);
          menu.clearPicked();
        }}
      >
        {attachments ? (
          <PromptInputAttachments>
            {(file) => (
              <PromptInputAttachment
                key={file.id}
                data={file}
                removeLabel={t("attachments.remove")}
              />
            )}
          </PromptInputAttachments>
        ) : null}
        <PromptInputTextarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (menu.open && (event.key === "Escape" || event.key === "Tab")) {
              event.preventDefault();
              menu.close();
              return;
            }
            if (
              event.key === "ArrowUp" &&
              event.currentTarget.value === "" &&
              onEditLast
            ) {
              event.preventDefault();
              onEditLast();
            }
          }}
          onKeyUp={menu.refresh}
          onClick={menu.refresh}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        <PromptInputFooter>
          <PromptInputTools>
            {attachments ? (
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger aria-label={t("attachments.add")} />
                <PromptInputActionMenuContent>
                  <PromptInputActionAddAttachments
                    label={t("attachments.add")}
                  />
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            ) : null}
            <SpeechInput
              startLabel={t("composer.voiceStart")}
              stopLabel={t("composer.voiceStop")}
              onTranscript={(text, isFinal) => {
                if (!isFinal) return;
                const spoken = text.trim();
                if (!spoken) return;
                onChange(value ? `${value.replace(/\s+$/, "")} ${spoken}` : spoken);
              }}
            />
            {models.length > 1 && modelId && onModelChange ? (
              <PromptInputSelect
                value={modelId}
                onValueChange={(next) => {
                  if (typeof next === "string") onModelChange(next);
                }}
              >
                <PromptInputSelectTrigger
                  size="sm"
                  aria-label={t("model.label")}
                >
                  <PromptInputSelectValue>
                    {(value: string) =>
                      models.find((model) => model.id === value)?.label ?? value
                    }
                  </PromptInputSelectValue>
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {models.map((model) => (
                    <PromptInputSelectItem key={model.id} value={model.id}>
                      {model.label}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>
            ) : null}
          </PromptInputTools>
          <PromptInputSubmit
            status={isStreaming ? "streaming" : uploading ? "submitted" : "ready"}
            label={isStreaming ? t("input.stop") : t("input.send")}
            disabled={
              !isStreaming && (disabled || uploading || !value.trim())
            }
            onClick={isStreaming ? onStop : undefined}
          />
        </PromptInputFooter>
      </PromptInput>
      <div className={compact ? "relative" : "relative mx-auto max-w-3xl"}>
        <ComposerMenu
          open={menu.open}
          options={menu.options}
          query={menu.query}
          onSelect={menu.select}
          emptyLabel={t("composer.noResults")}
        />
      </div>
      {compact ? null : (
        <p className="mx-auto mt-1 max-w-3xl px-1 text-xs text-muted-foreground">
          {t("input.hint")}
        </p>
      )}
    </div>
  );
}
