"use client";

/**
 * `/` commands and `@` mentions in the composer.
 *
 * Watches the text at the caret: a `/` that starts the message opens
 * the command list, an `@` that starts a word opens the mention picker,
 * and what follows the trigger filters both. Picking a command inserts
 * its text or runs it; picking a mention writes `@label` and keeps the
 * pick, so the turn can carry `body.mentions` for `resolveAgent`.
 *
 * Both lists come from `lib/chat-config.tsx`; a deployment with
 * neither never sees a menu.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { ComposerMenuOption } from "@/components/ui/ai-composer-menu";
import { chatConfig, type ChatMention } from "@/lib/chat-config";

export type ComposerMenuKind = "command" | "mention";

type Trigger = { kind: ComposerMenuKind; start: number; query: string };

const SEARCH_DEBOUNCE_MS = 150;

/** The trigger under the caret, if the text at that point is one. */
export function detectTrigger(
  text: string,
  caret: number,
  mentionTrigger = "@"
): Trigger | null {
  const before = text.slice(0, caret);
  if (/\s/.test(before.slice(-1))) return null;

  const slash = before.match(/^\/([\w-]*)$/);
  if (slash) return { kind: "command", start: 0, query: slash[1] ?? "" };

  const at = before.lastIndexOf(mentionTrigger);
  if (at === -1) return null;
  if (at > 0 && !/\s/.test(before[at - 1]!)) return null;
  const query = before.slice(at + mentionTrigger.length);
  if (/\s/.test(query)) return null;
  return { kind: "mention", start: at, query };
}

export function useComposerMenu({
  value,
  setValue,
  conversationId,
  send,
  textareaRef,
}: {
  value: string;
  setValue: (text: string) => void;
  conversationId: string;
  send: (text: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const tAny = useTranslations();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [mentionResults, setMentionResults] = useState<ChatMention[]>([]);
  const [picked, setPicked] = useState<ChatMention[]>([]);
  const dismissed = useRef<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commands = chatConfig.commands ?? [];
  const mentions = chatConfig.mentions;
  const mentionTrigger = mentions?.trigger ?? "@";

  /** Re-read the caret after every change; the trigger follows it. */
  const refresh = useCallback(() => {
    const element = textareaRef.current;
    if (!element) return;
    const caret = element.selectionStart ?? element.value.length;
    const next = detectTrigger(element.value, caret, mentionTrigger);
    if (next?.kind === "command" && commands.length === 0) {
      setTrigger(null);
      return;
    }
    if (next?.kind === "mention" && !mentions) {
      setTrigger(null);
      return;
    }
    const key = next ? `${next.kind}:${next.start}` : null;
    if (key && dismissed.current === key) {
      setTrigger(null);
      return;
    }
    if (!next) dismissed.current = null;
    setTrigger(next);
  }, [textareaRef, mentionTrigger, commands.length, mentions]);

  useEffect(() => {
    refresh();
  }, [value, refresh]);

  useEffect(() => {
    if (trigger?.kind !== "mention" || !mentions) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const query = trigger.query;
    searchTimer.current = setTimeout(() => {
      void Promise.resolve(mentions.search(query)).then(setMentionResults);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [trigger?.kind, trigger?.query, mentions]);

  const options = useMemo<ComposerMenuOption[]>(() => {
    if (trigger?.kind === "command") {
      return commands.map((command) => ({
        value: command.id,
        label: tAny(command.labelKey),
        description: command.descriptionKey
          ? tAny(command.descriptionKey)
          : `/${command.id}`,
      }));
    }
    if (trigger?.kind === "mention") {
      return mentionResults.map((mention) => ({
        value: mention.id,
        label: mention.label,
        description: mention.description,
        group: mention.groupKey ? tAny(mention.groupKey) : undefined,
      }));
    }
    return [];
  }, [trigger?.kind, commands, mentionResults, tAny]);

  const close = useCallback(() => {
    if (trigger) dismissed.current = `${trigger.kind}:${trigger.start}`;
    setTrigger(null);
  }, [trigger]);

  const select = useCallback(
    (option: ComposerMenuOption) => {
      if (!trigger) return;
      const element = textareaRef.current;
      const caret = element?.selectionStart ?? value.length;
      const after = value.slice(caret);

      if (trigger.kind === "command") {
        const command = commands.find((c) => c.id === option.value);
        setTrigger(null);
        if (!command) return;
        if (command.run) {
          setValue("");
          command.run({ conversationId, setText: setValue, send });
          return;
        }
        setValue(`${command.insert ?? ""}${after}`);
        return;
      }

      const mention = mentionResults.find((m) => m.id === option.value);
      setTrigger(null);
      if (!mention) return;
      setPicked((previous) =>
        previous.some((m) => m.id === mention.id)
          ? previous
          : [...previous, mention]
      );
      const before = value.slice(0, trigger.start);
      setValue(`${before}${mentionTrigger}${mention.label} ${after}`);
    },
    [
      trigger,
      textareaRef,
      value,
      commands,
      setValue,
      conversationId,
      send,
      mentionResults,
      mentionTrigger,
    ]
  );

  /** The mentions still present in the text, for the turn's body. */
  const activeMentions = useMemo(
    () =>
      picked.filter((mention) =>
        value.includes(`${mentionTrigger}${mention.label}`)
      ),
    [picked, value, mentionTrigger]
  );

  const clearPicked = useCallback(() => setPicked([]), []);

  return {
    open: trigger !== null && (options.length > 0 || trigger.kind === "mention"),
    kind: trigger?.kind ?? null,
    query: trigger?.query ?? "",
    options,
    select,
    close,
    refresh,
    mentions: activeMentions,
    clearPicked,
  };
}
