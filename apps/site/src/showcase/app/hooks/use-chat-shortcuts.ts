"use client";

/**
 * The keyboard a chat is expected to have.
 *
 *   ⌘/Ctrl+K   new chat
 *   Esc        stop a reply that is streaming
 *
 * Enter / Shift+Enter live in the composer (the T3 prompt input), and
 * ArrowUp-to-edit-the-last-message is the composer's too, because it
 * only means that when the composer is empty and focused.
 *
 * Window-level, but polite: a shortcut never fires while the reader is
 * typing in some other field, except Esc, which is always "stop".
 */

import { useEffect } from "react";

export function useChatShortcuts({
  onNewChat,
  onStop,
  isStreaming,
}: {
  onNewChat: () => void;
  onStop: () => void;
  isStreaming: boolean;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const modifier = event.metaKey || event.ctrlKey;

      if (modifier && (event.key === "k" || event.key === "K")) {
        event.preventDefault();
        onNewChat();
        return;
      }
      if (event.key === "Escape" && isStreaming) {
        event.preventDefault();
        onStop();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onNewChat, onStop, isStreaming]);
}
