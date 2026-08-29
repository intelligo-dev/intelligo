"use client";

/**
 * Conversation header — title with inline rename, a history dropdown
 * for switching conversations, a "New chat" link, and delete.
 *
 * The history dropdown and "New chat" here are the small-screen
 * controls: from `lg` up, `ConversationSidebar` shows the same list
 * permanently and both are hidden rather than duplicated.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  ChevronDown,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
import type { ConversationSummary } from "@/actions/chat";
import { chatConfig } from "@/lib/chat-config";

interface ConversationHeaderProps {
  conversationId: string;
  title: string | null;
  history: ConversationSummary[];
}

export function ConversationHeader({
  conversationId,
  title,
  history,
}: ConversationHeaderProps) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(title ?? "");
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
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={commitRename}
              aria-label={t("header.renameSave")}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => setIsEditing(false)}
              aria-label={t("header.renameCancel")}
            >
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            <h1 className="truncate text-sm font-medium">
              {title || t("header.newChatTitle")}
            </h1>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={startEditing}
              aria-label={t("header.renameEdit")}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {HeaderRight ? <HeaderRight conversationId={conversationId} /> : null}

        {/* Below `lg` this is the only way to reach history; at `lg`
            and up `ConversationSidebar` shows the same list. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1 lg:hidden">
              {t("header.historyTrigger")}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {history.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                {t("header.historyEmpty")}
              </div>
            ) : (
              history.map((item) => (
                <DropdownMenuItem key={item.id} asChild>
                  <Link href={`/chat/${item.id}`} className="truncate">
                    {item.title || t("header.historyUntitled")}
                  </Link>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="outline" size="sm" asChild className="lg:hidden">
          <Link href="/chat">
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("header.newChat")}
          </Link>
        </Button>

        {/* Confirmed: deleting a conversation is unrecoverable, and
            this control sits one pixel from "New chat". */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={isPending}
              aria-label={t("header.delete")}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
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
