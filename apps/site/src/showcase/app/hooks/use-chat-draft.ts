"use client";

/**
 * The composer's unsent text, kept per conversation.
 *
 * Switching models, opening another conversation and coming back, or a
 * tab that reloads should never cost a half-written message. The draft
 * lives in `localStorage` under the conversation id and is cleared
 * the moment it is sent.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;

function key(conversationId: string) {
  return `chat:draft:${conversationId}`;
}

export function useChatDraft(conversationId: string) {
  const [value, setValue] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      setValue(localStorage.getItem(key(conversationId)) ?? "");
    } catch {
      setValue("");
    }
  }, [conversationId]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        try {
          if (next) localStorage.setItem(key(conversationId), next);
          else localStorage.removeItem(key(conversationId));
        } catch {
          // A draft is a convenience, not a record.
        }
      }, DEBOUNCE_MS);
    },
    [conversationId]
  );

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setValue("");
    try {
      localStorage.removeItem(key(conversationId));
    } catch {
      // See above.
    }
  }, [conversationId]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { value, setValue: update, clear };
}
