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
  CheckIcon,
  ChevronDownIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
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

        {/* Below `lg` this is the only way to reach history; at `lg`
            and up `ConversationSidebar` shows the same list. */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" size="sm" className="gap-1 lg:hidden" />
            }
          >
            {t("header.historyTrigger")}
            <ChevronDownIcon data-icon="inline-end" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {history.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                {t("header.historyEmpty")}
              </div>
            ) : (
              history.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  render={
                    <Link href={`/chat/${item.id}`} className="truncate" />
                  }
                >
                  {item.title || t("header.historyUntitled")}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="lg:hidden"
          render={<Link href="/chat" />}
          nativeButton={false}
        >
          <PlusIcon data-icon="inline-start" />
          {t("header.newChat")}
        </Button>

        {/* Confirmed: deleting a conversation is unrecoverable, and
            this control sits one pixel from "New chat". */}
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
