/**
 * Conversation windowing: what the model is shown of a long history.
 *
 * `UIMessage`-shaped on purpose — this is the AI SDK's transcript, not
 * persistence (ADR-0009 keeps windowing out of core for that reason).
 * The default `prepareMessages` applies it; an application that wants
 * to summarise what was pruned does so in its own `prepareMessages`,
 * with its own model, and hands the summary back as `system`.
 */

import type { UIMessage } from "ai";

type TextPart = { type: "text"; text: string };

function isTextPart(part: unknown): part is TextPart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: unknown }).type === "text" &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

/** The text parts of a message, joined. Tool and file parts contribute nothing. */
export function extractText(parts: ReadonlyArray<unknown>): string {
  return parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join(" ");
}

/**
 * A cheap token estimate that does not need a tokenizer.
 *
 * Latin text runs about four characters per token; Cyrillic — and
 * most non-Latin scripts — closer to two, because their byte-pair
 * vocabularies are smaller. A single divisor would under-count a
 * Cyrillic transcript by half and window it far too late.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  let nonLatin = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x024f) nonLatin++;
  }
  const latin = text.length - nonLatin;
  return Math.ceil(latin / 4 + nonLatin / 2);
}

export function estimateConversationTokens(
  messages: ReadonlyArray<UIMessage>
): number {
  let total = 0;
  for (const message of messages) {
    // Tool payloads are not text but still cost tokens; count their
    // serialised size at the Latin rate.
    for (const part of message.parts) {
      total += isTextPart(part)
        ? estimateTokenCount(part.text)
        : Math.ceil(JSON.stringify(part).length / 4);
    }
  }
  return total;
}

export type ConversationWindowOptions = {
  /** Keep at most this many non-system messages. */
  maxMessages: number;
  /** Also drop from the front until the estimate fits, when set. */
  maxTokens?: number;
};

export type ConversationWindow = {
  windowed: UIMessage[];
  pruned: UIMessage[];
};

/**
 * Keep the most recent messages, always starting the window on a user
 * turn so the model never sees an assistant reply without the message
 * it answered. System messages are never pruned.
 */
export function applyConversationWindow(
  messages: ReadonlyArray<UIMessage>,
  options: ConversationWindowOptions
): ConversationWindow {
  const system = messages.filter((message) => message.role === "system");
  const turns = messages.filter((message) => message.role !== "system");

  let start = Math.max(0, turns.length - options.maxMessages);
  if (options.maxTokens !== undefined) {
    while (
      start < turns.length - 1 &&
      estimateConversationTokens(turns.slice(start)) > options.maxTokens
    ) {
      start++;
    }
  }
  // Open on a user message. If none follows, keep the last turn: a
  // window of nothing is worse than one that opens mid-exchange.
  while (start < turns.length - 1 && turns[start]?.role !== "user") start++;

  return {
    windowed: [...system, ...turns.slice(start)],
    pruned: turns.slice(0, start),
  };
}
