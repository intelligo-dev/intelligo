/**
 * Keeping a conversation's files out of every request after the first.
 *
 * An inline file travels as a data URL, and `useChat` sends the whole
 * transcript each turn: a 3 MB image would be 4 MB of base64 in every
 * later request, past a serverless body limit for the rest of the chat.
 * Once a message is stored the server already holds its bytes, so the
 * client sends earlier messages' files with a placeholder URL and the
 * handler restores them from storage. Pure: imported by the browser.
 */

import type { UIMessage } from "ai";

/** The URL an elided file part carries in place of its bytes. */
export const ELIDED_FILE_URL = "intelligo:elided";

function hasInlineFile(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      part.type === "file" &&
      typeof (part as { url?: unknown }).url === "string" &&
      (part as { url: string }).url.startsWith("data:")
  );
}

/** Every message but the last, with its inline files' bytes replaced. */
export function elideEarlierFiles<M extends UIMessage>(messages: M[]): M[] {
  return messages.map((message, index) => {
    if (index === messages.length - 1 || !hasInlineFile(message)) {
      return message;
    }
    return {
      ...message,
      parts: message.parts.map((part) =>
        part.type === "file" &&
        (part as { url: string }).url.startsWith("data:")
          ? { ...part, url: ELIDED_FILE_URL }
          : part
      ),
    };
  });
}

/** Whether a message carries a file part whose bytes were elided. */
export function hasElidedFile(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      part.type === "file" &&
      (part as { url?: unknown }).url === ELIDED_FILE_URL
  );
}

/**
 * `prepareSendMessagesRequest` for the AI SDK's `DefaultChatTransport`:
 * the request it would send, with earlier messages' inline files elided.
 *
 *     new DefaultChatTransport({
 *       api: "/api/chat",
 *       prepareSendMessagesRequest: sendWithoutEarlierFiles,
 *     });
 */
export function sendWithoutEarlierFiles(options: {
  id: string;
  messages: UIMessage[];
  body: Record<string, unknown> | undefined;
  trigger: "submit-message" | "regenerate-message";
  messageId: string | undefined;
}): { body: object } {
  return {
    body: {
      ...options.body,
      id: options.id,
      messages: elideEarlierFiles(options.messages),
      trigger: options.trigger,
      messageId: options.messageId,
    },
  };
}
