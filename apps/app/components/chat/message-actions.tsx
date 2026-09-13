"use client";

/**
 * The row under a message: copy, edit, regenerate, feedback, save.
 *
 * Revealed on hover and on focus — and always shown on the last
 * message, because on a touch screen there is no hover. Every control
 * is a labelled icon button with a tooltip; the icons alone are not
 * the accessible name.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  FileDownIcon,
  PencilIcon,
  RefreshCwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { saveMessageAsArtifact, voteMessage } from "@/actions/chat";

export type MessageVote = "up" | "down" | null;

interface MessageActionsProps {
  conversationId: string;
  messageId: string;
  role: "user" | "assistant";
  text: string;
  vote: MessageVote;
  /** The row stays visible without hover. */
  alwaysVisible?: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onVote?: (vote: MessageVote) => void;
}

function IconAction({
  label,
  onClick,
  pressed,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn(
              "text-muted-foreground",
              pressed && "bg-accent text-foreground"
            )}
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function MessageActions({
  conversationId,
  messageId,
  role,
  text,
  vote,
  alwaysVisible = false,
  onEdit,
  onRegenerate,
  onVote,
}: MessageActionsProps) {
  const t = useTranslations("chat");
  const [isSaving, startSaving] = useTransition();
  const [current, setCurrent] = useState<MessageVote>(vote);

  function handleSave() {
    startSaving(async () => {
      const result = await saveMessageAsArtifact({ messageId, content: text });
      if (result.success) toast.success(t("actions.savedToArtifacts"));
      else toast.error(result.error);
    });
  }

  function handleVote(next: Exclude<MessageVote, null>) {
    const value: MessageVote = current === next ? null : next;
    setCurrent(value);
    onVote?.(value);
    void voteMessage(conversationId, messageId, value).then((result) => {
      if (!result.success) {
        setCurrent(current);
        toast.error(result.error);
      } else if (value) {
        toast.success(t("actions.feedbackSent"));
      }
    });
  }

  return (
    <div
      data-slot="message-actions"
      className={cn(
        "flex items-center gap-0.5 transition-opacity focus-within:opacity-100 group-hover/chat-message:opacity-100",
        alwaysVisible ? "opacity-100" : "opacity-0"
      )}
    >
      {text ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <CopyButton
                value={text}
                label={t("actions.copy")}
                copiedLabel={t("actions.copied")}
                onCopyError={() => toast.error(t("actions.copyFailed"))}
                size="icon-xs"
                variant="ghost"
                className="text-muted-foreground"
              />
            }
          />
          <TooltipContent>{t("actions.copy")}</TooltipContent>
        </Tooltip>
      ) : null}

      {role === "user" && onEdit ? (
        <IconAction label={t("actions.edit")} onClick={onEdit}>
          <PencilIcon />
        </IconAction>
      ) : null}

      {role === "assistant" && onRegenerate ? (
        <IconAction label={t("actions.regenerate")} onClick={onRegenerate}>
          <RefreshCwIcon />
        </IconAction>
      ) : null}

      {role === "assistant" ? (
        <>
          <IconAction
            label={t("actions.feedbackUp")}
            pressed={current === "up"}
            onClick={() => handleVote("up")}
          >
            <ThumbsUpIcon />
          </IconAction>
          <IconAction
            label={t("actions.feedbackDown")}
            pressed={current === "down"}
            onClick={() => handleVote("down")}
          >
            <ThumbsDownIcon />
          </IconAction>
          {text ? (
            <IconAction
              label={t("actions.save")}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? <Spinner /> : <FileDownIcon />}
            </IconAction>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
