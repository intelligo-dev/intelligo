"use client";

/**
 * Conversation header — the agent's name, the title with inline
 * rename, the consumer's `headerRight` slot, share, and delete.
 * History lives in the shell's sidebar (`ChatHistory`), which already
 * opens as a sheet on a phone.
 *
 * Under the app shell it renders into the shell header's
 * `shell-header-slot`, so the page has one bar, not two; anywhere
 * without that slot it is a header of its own.
 */

import { useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { deleteConversation, renameConversation } from "@/actions/chat";
import { chatConfig } from "@/lib/chat-config";
import { ShareDialog } from "./share-dialog";

interface ConversationHeaderProps {
  conversationId: string;
  title: string | null;
}

export function ConversationHeader({
  conversationId,
  title,
}: ConversationHeaderProps) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? "");
  const slot = useSyncExternalStore(
    subscribeToNothing,
    findSlot,
    noSlotOnServer
  );
  const HeaderRight = chatConfig.headerRight;
  const agentName = chatConfig.agent?.name ?? t("agent.defaultName");
  const agentIcon = chatConfig.agent?.icon;

  function startEditing() {
    setDraftTitle(title ?? "");
    setIsEditing(true);
  }

  function commitRename() {
    const trimmed = draftTitle.trim();
    setIsEditing(false);
    if (!trimmed || trimmed === title) return;

    startTransition(async () => {
      const result = await renameConversation(conversationId, trimmed);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteConversation(conversationId);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.push("/chat");
      // The shell's history is rendered by the layout, which a
      // navigation does not re-render.
      router.refresh();
    });
  }

  const bar = (
    <div
      data-slot="conversation-header"
      className="flex min-w-0 flex-1 items-center justify-between gap-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <span className="mr-1 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {agentIcon ? <span aria-hidden>{agentIcon}</span> : null}
          <span className="max-w-24 truncate">{agentName}</span>
        </span>
        {isEditing ? (
          <>
            <Input
              autoFocus
              aria-label={t("header.renameEdit")}
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") setIsEditing(false);
              }}
              className="h-8 max-w-xs"
            />
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              onClick={commitRename}
              aria-label={t("header.renameSave")}
            >
              <CheckIcon />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => setIsEditing(false)}
              aria-label={t("header.renameCancel")}
            >
              <XIcon />
            </Button>
          </>
        ) : (
          <>
            <h1 className="truncate text-sm font-medium">
              {title || t("header.newChatTitle")}
            </h1>
            <Button
              size="icon-xs"
              variant="ghost"
              className="shrink-0"
              onClick={startEditing}
              aria-label={t("header.renameEdit")}
            >
              <PencilIcon />
            </Button>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {HeaderRight ? <HeaderRight conversationId={conversationId} /> : null}

        <ShareDialog conversationId={conversationId} />

        {/* Confirmed: deleting a conversation is unrecoverable. */}
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={isPending}
                aria-label={t("header.delete")}
              />
            }
          >
            {isPending ? <Spinner /> : <Trash2Icon />}
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("deleteDialog.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteDialog.description")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("deleteDialog.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>
                {t("deleteDialog.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );

  // Undefined while rendering on the server and hydrating: the slot is
  // only known in the browser, and the bar appears once it is.
  if (slot === undefined) return null;
  if (slot) return createPortal(bar, slot);
  return (
    <header className="flex items-center border-b px-4 py-3">{bar}</header>
  );
}

const SLOT_SELECTOR = '[data-slot="shell-header-slot"]';

function subscribeToNothing() {
  return () => {};
}

function findSlot(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SLOT_SELECTOR);
}

function noSlotOnServer(): undefined {
  return undefined;
}
