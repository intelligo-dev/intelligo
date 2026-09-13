"use client";

/**
 * Conversation header — the agent's name, the title with inline
 * rename, the consumer's `headerRight` slot, share, and delete.
 *
 * Below `lg` the sidebar is not on screen, so the header carries a
 * trigger that opens it in a sheet; from `lg` up the page renders the
 * sidebar as a column and the trigger is hidden.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "use-intl";
import {
  CheckIcon,
  PanelLeftIcon,
  PencilIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@showcase/i18n/navigation";
import { Button } from "@showcase/components/ui/button";
import { Input } from "@showcase/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@showcase/components/ui/sheet";
import { Spinner } from "@showcase/components/ui/spinner";
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
} from "@showcase/components/ui/alert-dialog";

import { deleteConversation, renameConversation } from "@showcase/actions/chat";
import type { ConversationSummary } from "@showcase/actions/chat";
import { chatConfig } from "@showcase/lib/chat-config";
import { ConversationSidebar } from "./conversation-sidebar";
import { ShareDialog } from "./share-dialog";

interface ConversationHeaderProps {
  conversationId: string;
  title: string | null;
  conversations: ConversationSummary[];
}

export function ConversationHeader({
  conversationId,
  title,
  conversations,
}: ConversationHeaderProps) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? "");
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    });
  }

  return (
    <header className="flex items-center justify-between gap-2 border-b px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {/* Below `lg` this is the only way to reach history; at `lg`
            and up the page renders the sidebar as a column. */}
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="mr-1 shrink-0 lg:hidden"
                aria-label={t("header.openHistory")}
              />
            }
          >
            <PanelLeftIcon />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">{t("sidebar.label")}</SheetTitle>
            <ConversationSidebar
              conversations={conversations}
              activeId={conversationId}
              onNavigate={() => setSidebarOpen(false)}
              className="flex h-full w-full border-r-0"
            />
          </SheetContent>
        </Sheet>

        <span className="mr-1 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          {agentIcon ? <span aria-hidden>{agentIcon}</span> : null}
          <span className="max-w-24 truncate">{agentName}</span>
        </span>
        {isEditing ? (
          <>
            <Input
              autoFocus
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
    </header>
  );
}
