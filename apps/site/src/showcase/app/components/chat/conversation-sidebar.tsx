"use client";

/**
 * Conversation history beside the chat — grouped by recency, pinned
 * on top, filterable, with everything a row needs: open, rename in
 * place, pin, delete with a few seconds to change your mind.
 *
 * From `lg` up the page renders it as a fixed column; below, the
 * header opens the same component in a sheet. Keyboard: arrows move
 * between rows, Enter opens, F2 renames, Delete deletes.
 *
 * Filtering is client-side over what the server already sent. That is
 * honest for the sizes this list actually reaches; a workspace with
 * thousands of conversations wants a server-side search action, and
 * this component's props are shaped so adding one later replaces the
 * filter without touching the layout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquareIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useTranslations } from "use-intl";
import { toast } from "sonner";

import { Link, useRouter } from "@showcase/i18n/navigation";
import { Button } from "@showcase/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@showcase/components/ui/dropdown-menu";
import { Empty, EmptyDescription } from "@showcase/components/ui/empty";
import { Input } from "@showcase/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@showcase/components/ui/input-group";
import { cn } from "@showcase/lib/utils";
import {
  deleteConversation,
  renameConversation,
  setConversationPinned,
  type ConversationSummary,
} from "@showcase/actions/chat";

interface ConversationSidebarProps {
  conversations: ConversationSummary[];
  /** The conversation on screen, highlighted and never filtered out. */
  activeId: string;
  /** Called after a row is opened — a sheet closes itself. */
  onNavigate?: () => void;
  className?: string;
}

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

export function ConversationSidebar({
  conversations,
  activeId,
  onNavigate,
  className,
}: ConversationSidebarProps) {
  const t = useTranslations("chat");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [pins, setPins] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLElement>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) clearTimeout(timer);
    },
    []
  );

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
    // `Date.now()` inside the memo, not during render, keeps the
    // bucket boundaries stable for a given filter pass.
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
      } else {
        router.refresh();
      }
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

  const remove = useCallback(
    (id: string) => {
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
          if (id === activeId) router.push("/chat");
          else router.refresh();
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
    },
    [activeId, router, t]
  );

  // Roving focus over the rows; the row's own link handles Enter.
  function onListKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-conversation]");
    if (!row || renamingId) return;
    const links = Array.from(
      listRef.current?.querySelectorAll<HTMLElement>("[data-conversation]") ?? []
    );
    const index = links.indexOf(row);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      links[Math.min(index + 1, links.length - 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      links[Math.max(index - 1, 0)]?.focus();
    } else if (event.key === "F2") {
      event.preventDefault();
      const conversation = rows.find((c) => c.id === row.dataset.conversation);
      if (conversation) startRename(conversation);
    } else if (event.key === "Delete") {
      event.preventDefault();
      if (row.dataset.conversation) remove(row.dataset.conversation);
    }
  }

  return (
    <aside className={cn("w-64 shrink-0 flex-col border-r", className)}>
      <div className="space-y-2 border-b p-3">
        <Button
          size="sm"
          className="w-full justify-start gap-2"
          render={<Link href="/chat" onClick={onNavigate} />}
          nativeButton={false}
        >
          <PlusIcon data-icon="inline-start" />
          {t("header.newChat")}
        </Button>

        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("sidebar.searchPlaceholder")}
            aria-label={t("sidebar.searchPlaceholder")}
          />
        </InputGroup>
      </div>

      <nav
        ref={listRef}
        aria-label={t("sidebar.label")}
        className="flex-1 overflow-y-auto px-2 py-3"
        onKeyDown={onListKeyDown}
      >
        {empty ? (
          <Empty className="p-4">
            <EmptyDescription>
              {query ? t("sidebar.noMatches") : t("header.historyEmpty")}
            </EmptyDescription>
          </Empty>
        ) : (
          BUCKET_ORDER.map((bucket) => {
            const items = grouped.get(bucket);
            if (!items?.length) return null;
            return (
              <div key={bucket} className="mb-4">
                <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">
                  {t(`sidebar.groups.${bucket}`)}
                </p>
                <ul>
                  {items.map((conversation) => {
                    const isActive = conversation.id === activeId;
                    const label =
                      conversation.title ?? t("header.historyUntitled");
                    if (renamingId === conversation.id) {
                      return (
                        <li key={conversation.id} className="px-1 py-0.5">
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
                            className="h-8"
                            aria-label={t("sidebar.rename")}
                          />
                        </li>
                      );
                    }
                    return (
                      <li
                        key={conversation.id}
                        className={cn(
                          "group/row flex items-center rounded-md",
                          isActive ? "bg-accent" : "hover:bg-accent/50"
                        )}
                      >
                        <Link
                          href={`/chat/${conversation.id}`}
                          data-conversation={conversation.id}
                          aria-current={isActive ? "page" : undefined}
                          onClick={onNavigate}
                          onDoubleClick={(event) => {
                            event.preventDefault();
                            startRename(conversation);
                          }}
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            isActive && "font-medium"
                          )}
                          title={label}
                        >
                          {conversation.pinned ? (
                            <PinIcon
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          ) : (
                            <MessageSquareIcon
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                          )}
                          <span className="truncate">{label}</span>
                        </Link>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                className="mr-1 shrink-0 text-muted-foreground opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-popup-open:opacity-100"
                                aria-label={t("sidebar.menu")}
                              />
                            }
                          >
                            <MoreHorizontalIcon />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
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
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </nav>

      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        {t("sidebar.count", { count: rows.length })}
      </p>
    </aside>
  );
}
