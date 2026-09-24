"use client";

/**
 * Conversation history in the app's own sidebar, under the navigation —
 * grouped by recency with pinned on top, filterable, and every row with
 * rename, pin and delete (with a few seconds to change your mind). The
 * row for the conversation on screen is highlighted from the URL, and
 * the group hides when the sidebar collapses to icons. A deleted row
 * folds away and comes back on undo; a new one slides in.
 *
 * Keyboard: F2 renames the focused row, Delete deletes it.
 *
 * Filtering is client-side over what the server sent (the newest 100).
 * Past that size it belongs in a query.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "use-intl";
import { AnimatePresence, useReducedMotion } from "motion/react";
import { toast } from "sonner";

import { Link, usePathname, useRouter } from "@showcase/i18n/navigation";
import { listItem } from "@showcase/components/ui/ai-motion";
import {
  AISidebarItem,
  AISidebarMenu,
  AISidebarMenuItem,
  AISidebarSection,
  useAISidebar,
  useAISidebarPanel,
} from "@showcase/components/ui/ai-sidebar";
import { Button } from "@showcase/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@showcase/components/ui/dropdown-menu";
import { Input } from "@showcase/components/ui/input";
import {
  deleteConversation,
  renameConversation,
  setConversationPinned,
  type ConversationSummary,
} from "@showcase/actions/chat";

type Bucket = "pinned" | "today" | "yesterday" | "week" | "month" | "older";

const BUCKET_ORDER: Bucket[] = [
  "pinned",
  "today",
  "yesterday",
  "week",
  "month",
  "older",
];

const UNDO_MS = 5000;
/** The search field shows once the list is long enough to need it. */
const SEARCH_FROM = 8;

function bucketFor(conversation: ConversationSummary, now: number): Bucket {
  if (conversation.pinned) return "pinned";
  const ageMs = now - new Date(conversation.updatedAt).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (ageMs < day) return "today";
  if (ageMs < 2 * day) return "yesterday";
  if (ageMs < 7 * day) return "week";
  if (ageMs < 30 * day) return "month";
  return "older";
}

export function ChatHistoryNav({
  conversations,
}: {
  conversations: ConversationSummary[];
}) {
  const t = useTranslations("chat");
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useAISidebar();
  const { collapsed } = useAISidebarPanel();
  const reduced = useReducedMotion() ?? false;
  const activeId = pathname?.match(/^\/chat\/([^/]+)/)?.[1] ?? null;

  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [pins, setPins] = useState<Record<string, boolean>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // Read when a delete lands, seconds after the click: by then the
  // reader may have opened another conversation.
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

  // Leaving with a delete still in its undo window keeps the delete:
  // the reader asked for it and did not take it back.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const [id, timer] of pending) {
        clearTimeout(timer);
        void deleteConversation(id);
      }
      pending.clear();
    };
  }, []);

  const rows = useMemo(
    () =>
      conversations
        .filter((conversation) => !hidden.has(conversation.id))
        .map((conversation) => ({
          ...conversation,
          title: titles[conversation.id] ?? conversation.title,
          pinned: pins[conversation.id] ?? conversation.pinned,
        })),
    [conversations, hidden, titles, pins]
  );

  const grouped = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const now = Date.now();
    const buckets = new Map<Bucket, typeof rows>();
    for (const conversation of rows) {
      if (
        needle &&
        conversation.id !== activeId &&
        !(conversation.title ?? "").toLowerCase().includes(needle)
      ) {
        continue;
      }
      const bucket = bucketFor(conversation, now);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), conversation]);
    }
    return buckets;
  }, [rows, query, activeId]);

  const empty = BUCKET_ORDER.every((bucket) => !grouped.get(bucket)?.length);

  function closeOnMobile() {
    if (isMobile) setOpenMobile(false);
  }

  function startRename(conversation: ConversationSummary) {
    setRenamingId(conversation.id);
    setDraft(titles[conversation.id] ?? conversation.title ?? "");
  }

  function commitRename(id: string) {
    const trimmed = draft.trim();
    setRenamingId(null);
    if (!trimmed) return;
    setTitles((previous) => ({ ...previous, [id]: trimmed }));
    void renameConversation(id, trimmed).then((result) => {
      if (!result.success) {
        setTitles((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function togglePin(conversation: ConversationSummary) {
    const next = !(pins[conversation.id] ?? conversation.pinned);
    setPins((previous) => ({ ...previous, [conversation.id]: next }));
    void setConversationPinned(conversation.id, next).then((result) => {
      if (!result.success) {
        setPins((previous) => ({ ...previous, [conversation.id]: !next }));
        toast.error(result.error);
      }
    });
  }

  function remove(id: string) {
    setHidden((previous) => new Set(previous).add(id));
    const timer = setTimeout(() => {
      timers.current.delete(id);
      void deleteConversation(id).then((result) => {
        if (!result.success) {
          setHidden((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
          toast.error(result.error);
          return;
        }
        if (id === activeIdRef.current) router.push("/chat");
        router.refresh();
      });
    }, UNDO_MS);
    timers.current.set(id, timer);
    toast(t("sidebar.deleted"), {
      duration: UNDO_MS,
      action: {
        label: t("sidebar.undo"),
        onClick: () => {
          const pendingTimer = timers.current.get(id);
          if (pendingTimer) clearTimeout(pendingTimer);
          timers.current.delete(id);
          setHidden((previous) => {
            const next = new Set(previous);
            next.delete(id);
            return next;
          });
        },
      },
    });
  }

  // In the icon rail there is no room for titles; the nav rows stay.
  if (collapsed) return null;

  return (
    <AISidebarSection
      label={t("sidebar.label")}
      action={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("sidebar.newChat")}
          title={t("sidebar.newChat")}
          render={<Link href="/chat" onClick={closeOnMobile} />}
          nativeButton={false}
        >
          <PlusIcon />
        </Button>
      }
    >
      <div className="flex flex-col gap-1">
        {rows.length >= SEARCH_FROM ? (
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            aria-label={t("sidebar.searchPlaceholder")}
            className="mb-1 h-8 bg-background"
          />
        ) : null}

        {empty ? (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            {query ? t("sidebar.noMatches") : t("header.historyEmpty")}
          </p>
        ) : (
          BUCKET_ORDER.map((bucket) => {
            const items = grouped.get(bucket);
            if (!items?.length) return null;
            return (
              <div key={bucket} className="flex flex-col">
                <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">
                  {t(`sidebar.groups.${bucket}`)}
                </p>
                <AISidebarMenu>
                  <AnimatePresence initial={false}>
                    {items.map((conversation) => {
                      const label =
                        conversation.title ?? t("header.historyUntitled");
                      const motionProps = reduced
                        ? {}
                        : {
                            variants: listItem,
                            initial: "hidden",
                            animate: "shown",
                            exit: "exit",
                          };
                      if (renamingId === conversation.id) {
                        return (
                          <AISidebarMenuItem
                            key={conversation.id}
                            {...motionProps}
                          >
                            <Input
                              autoFocus
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              onBlur={() => commitRename(conversation.id)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitRename(conversation.id);
                                }
                                if (event.key === "Escape") setRenamingId(null);
                              }}
                              aria-label={t("sidebar.rename")}
                              className="h-8 bg-background"
                            />
                          </AISidebarMenuItem>
                        );
                      }
                      return (
                        <AISidebarMenuItem
                          key={conversation.id}
                          {...motionProps}
                        >
                          <AISidebarItem
                            isActive={conversation.id === activeId}
                            title={label}
                            render={<Link href={`/chat/${conversation.id}`} />}
                            onKeyDown={(event) => {
                              if (event.key === "F2") {
                                event.preventDefault();
                                startRename(conversation);
                              } else if (event.key === "Delete") {
                                event.preventDefault();
                                remove(conversation.id);
                              }
                            }}
                            action={
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button
                                      variant="ghost"
                                      size="icon-xs"
                                      aria-label={t("sidebar.menu")}
                                    />
                                  }
                                >
                                  <MoreHorizontalIcon />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent side="right" align="start">
                                  <DropdownMenuItem
                                    onClick={() => togglePin(conversation)}
                                  >
                                    {conversation.pinned ? (
                                      <PinOffIcon />
                                    ) : (
                                      <PinIcon />
                                    )}
                                    {conversation.pinned
                                      ? t("sidebar.unpin")
                                      : t("sidebar.pin")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => startRename(conversation)}
                                  >
                                    <PencilIcon />
                                    {t("sidebar.rename")}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onClick={() => remove(conversation.id)}
                                  >
                                    <Trash2Icon />
                                    {t("sidebar.delete")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            }
                          >
                            {label}
                          </AISidebarItem>
                        </AISidebarMenuItem>
                      );
                    })}
                  </AnimatePresence>
                </AISidebarMenu>
              </div>
            );
          })
        )}
      </div>
    </AISidebarSection>
  );
}
