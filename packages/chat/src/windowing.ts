/**
 * Conversation windowing: what the model is shown of a long history.
 *
 * Works on `UIMessage`s, the AI SDK's transcript, not stored rows.
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
  // Stryker disable next-line ConditionalExpression: equivalent — the loop below counts nothing in an empty string and returns 0 either way.
  if (!text) return 0;
  let nonLatin = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code > 0x024f) nonLatin++;
  }
  const latin = text.length - nonLatin;
  return Math.ceil(latin / 4 + nonLatin / 2);
}

/** What a model reads of one image, whatever its encoded size. */
export const IMAGE_TOKEN_ESTIMATE = 1_600;
/** The least a document costs, and all a linked one is counted at. */
const DOCUMENT_TOKEN_FLOOR = 1_600;
/** Bytes of a binary document per token: pages carry markup and images. */
const DOCUMENT_BYTES_PER_TOKEN = 16;

const TEXT_MEDIA_TYPE =
  /^(text\/|application\/(json|xml|csv|x-ndjson|yaml)\b|[^;]*\+(json|xml)\b)/;

/** The decoded size of a data URL's payload; null for any other URL. */
function dataUrlBytes(url: string): number | null {
  if (!url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma < 0) return 0;
  const payload = url.length - comma - 1;
  if (!url.slice(0, comma).endsWith(";base64")) return payload;
  const padding = url.endsWith("==") ? 2 : url.endsWith("=") ? 1 : 0;
  return Math.floor((payload * 3) / 4) - padding;
}

/**
 * A file part's cost, by what the model reads rather than how the part
 * is encoded: counted by its base64, a 1 MB inline image would weigh
 * hundreds of thousands of tokens. An image is a flat estimate; a text
 * file its decoded length at the Latin rate; any other document its
 * decoded size, never under the floor.
 */
function estimateFileTokens(part: { mediaType?: unknown; url?: unknown }) {
  const mediaType = typeof part.mediaType === "string" ? part.mediaType : "";
  if (mediaType.startsWith("image/")) return IMAGE_TOKEN_ESTIMATE;
  const bytes = typeof part.url === "string" ? dataUrlBytes(part.url) : null;
  if (bytes === null) return DOCUMENT_TOKEN_FLOOR;
  if (TEXT_MEDIA_TYPE.test(mediaType)) return Math.ceil(bytes / 4);
  return Math.max(
    DOCUMENT_TOKEN_FLOOR,
    Math.ceil(bytes / DOCUMENT_BYTES_PER_TOKEN)
  );
}

export function estimateConversationTokens(
  messages: ReadonlyArray<UIMessage>
): number {
  let total = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (isTextPart(part)) total += estimateTokenCount(part.text);
      else if (part.type === "file") total += estimateFileTokens(part);
      // Tool payloads are not text but still cost tokens; count their
      // serialised size at the Latin rate.
      else total += Math.ceil(JSON.stringify(part).length / 4);
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
  // Stryker disable next-line ConditionalExpression: equivalent — with no budget the comparison against undefined is false, so the loop exits on its first test.
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
  // Stryker disable next-line OptionalChaining: equivalent — the condition to its left has already proved the index is in range.
  while (start < turns.length - 1 && turns[start]?.role !== "user") start++;
  // A window with no user message in it — an approval continuation
  // whose assistant message alone is over budget — reaches back to the
  // nearest one: a transcript without the question is one a provider
  // may refuse and a model cannot answer, whatever the budget says.
  if (turns[start]?.role !== "user") {
    let question = start - 1;
    while (question >= 0 && turns[question]!.role !== "user") question--;
    if (question >= 0) start = question;
  }

  return {
    windowed: [...system, ...turns.slice(start)],
    pruned: turns.slice(0, start),
  };
}
