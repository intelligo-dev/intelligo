"use client";

/**
 * Versions of a reply, kept where the reader can flip between them.
 *
 * Regenerating a reply or editing a message does not lose the earlier
 * attempt: the tail of the conversation from that point on is kept as
 * a version, and the message that starts the tail shows a `< 2 / 3 >`
 * pager. Versions live in this tab (mirrored to `sessionStorage`, so a
 * refresh within the tab keeps them); the server persists the latest
 * path only. That is a deliberate scope: the row stays a list, no
 * migration, and a reload shows what was last said.
 *
 * An *anchor* is the message just before the point that branched — the
 * user message a reply answers, or the message before an edited user
 * message. `ROOT` anchors a branch at the very start.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UIMessage } from "ai";

export const ROOT_ANCHOR = "__root__";

type VersionSet = {
  tails: UIMessage[][];
  active: number;
};

export type ChatVersion = { index: number; count: number };

type Pending = { anchorId: string };

function storageKey(conversationId: string) {
  return `chat:versions:${conversationId}`;
}

function readStored(conversationId: string): Record<string, VersionSet> {
  try {
    const raw = sessionStorage.getItem(storageKey(conversationId));
    return raw ? (JSON.parse(raw) as Record<string, VersionSet>) : {};
  } catch {
    return {};
  }
}

function writeStored(
  conversationId: string,
  versions: Record<string, VersionSet>
) {
  try {
    if (Object.keys(versions).length === 0) {
      sessionStorage.removeItem(storageKey(conversationId));
    } else {
      sessionStorage.setItem(
        storageKey(conversationId),
        JSON.stringify(versions)
      );
    }
  } catch {
    // Storage is a convenience; a private window without it still chats.
  }
}

function anchorIndex(messages: UIMessage[], anchorId: string): number {
  if (anchorId === ROOT_ANCHOR) return -1;
  return messages.findIndex((message) => message.id === anchorId);
}

export function useChatVersions({
  conversationId,
  messages,
  setMessages,
  status,
}: {
  conversationId: string;
  messages: UIMessage[];
  setMessages: (messages: UIMessage[]) => void;
  status: "submitted" | "streaming" | "ready" | "error";
}) {
  const [versions, setVersions] = useState<Record<string, VersionSet>>({});
  const pending = useRef<Pending | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    setVersions(readStored(conversationId));
    hydrated.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (hydrated.current) writeStored(conversationId, versions);
  }, [conversationId, versions]);

  /** Keep the tail on screen before it is replaced. */
  const snapshot = useCallback(
    (anchorId: string) => {
      const at = anchorIndex(messages, anchorId);
      const tail = messages.slice(at + 1);
      setVersions((previous) => {
        const existing = previous[anchorId];
        if (existing) {
          const tails = [...existing.tails];
          tails[existing.active] = tail;
          return { ...previous, [anchorId]: { ...existing, tails } };
        }
        return { ...previous, [anchorId]: { tails: [tail], active: 0 } };
      });
      pending.current = { anchorId };
    },
    [messages]
  );

  /** Before `regenerate({ messageId })`: the message before the reply anchors it. */
  const beforeRegenerate = useCallback(
    (assistantMessageId: string) => {
      const at = messages.findIndex((m) => m.id === assistantMessageId);
      if (at === -1) return;
      snapshot(at === 0 ? ROOT_ANCHOR : messages[at - 1]!.id);
    },
    [messages, snapshot]
  );

  /** Before an edit re-sends a user message with a new id. */
  const beforeEdit = useCallback(
    (userMessageId: string) => {
      const at = messages.findIndex((m) => m.id === userMessageId);
      if (at === -1) return;
      snapshot(at === 0 ? ROOT_ANCHOR : messages[at - 1]!.id);
    },
    [messages, snapshot]
  );

  // When the turn that followed a snapshot settles, the tail on screen
  // becomes the newest version. While idle, the active version tracks
  // whatever the thread now holds after its anchor, so a follow-up sent
  // on an older version grows that version rather than being lost.
  useEffect(() => {
    if (status !== "ready") return;
    const commit = pending.current;
    pending.current = null;
    setVersions((previous) => {
      let next = previous;
      let changed = false;
      for (const [anchorId, set] of Object.entries(previous)) {
        const at = anchorIndex(messages, anchorId);
        if (at === -1 && anchorId !== ROOT_ANCHOR) continue;
        const tail = messages.slice(at + 1);
        if (commit?.anchorId === anchorId) {
          next = {
            ...next,
            [anchorId]: {
              tails: [...set.tails, tail],
              active: set.tails.length,
            },
          };
          changed = true;
        } else if (tail.length > 0) {
          const tails = [...set.tails];
          tails[set.active] = tail;
          next = { ...next, [anchorId]: { ...set, tails } };
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [status, messages]);

  const select = useCallback(
    (anchorId: string, index: number) => {
      const set = versions[anchorId];
      const tail = set?.tails[index];
      if (!set || !tail) return;
      const at = anchorIndex(messages, anchorId);
      if (at === -1 && anchorId !== ROOT_ANCHOR) return;
      setVersions((previous) => ({
        ...previous,
        [anchorId]: { ...set, active: index },
      }));
      setMessages([...messages.slice(0, at + 1), ...tail]);
    },
    [versions, messages, setMessages]
  );

  /** The pager state for the message that follows `anchorId`, if it has versions. */
  const versionOf = useMemo(() => {
    const byFirstMessage = new Map<
      string,
      ChatVersion & { anchorId: string }
    >();
    for (const [anchorId, set] of Object.entries(versions)) {
      if (set.tails.length < 2) continue;
      const at = anchorIndex(messages, anchorId);
      if (at === -1 && anchorId !== ROOT_ANCHOR) continue;
      const first = messages[at + 1];
      if (!first) continue;
      byFirstMessage.set(first.id, {
        anchorId,
        index: set.active,
        count: set.tails.length,
      });
    }
    return (messageId: string) => byFirstMessage.get(messageId) ?? null;
  }, [versions, messages]);

  return { beforeRegenerate, beforeEdit, select, versionOf };
}
