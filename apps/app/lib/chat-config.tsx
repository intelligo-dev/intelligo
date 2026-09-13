/**
 * Chat composition config — the consumer-owned extension point for
 * everything a vertical wants to add to the chat surface without
 * editing an installed component (ADR-0005: composition through a
 * config a consumer owns, never a component edit).
 *
 * Every seam is optional — a fresh install ships this file with an
 * empty `chatConfig`, so the chat surface renders its baseline UI:
 *
 *  - `agent`: the identity shown in the conversation header — a
 *    name and optional icon/emoji. Omit it (the default) and the
 *    header falls back to this item's own translated "Assistant"
 *    label (`messages/en/chat.json`'s `agent.defaultName`). `name`
 *    and `icon` are plain strings rather than message keys because
 *    an agent's display name is product copy, not framework copy.
 *  - `starters`: conversation-starter prompts shown on an empty
 *    conversation, as *message keys* — not literal strings — resolved
 *    against your app's full message tree via next-intl's
 *    namespace-less `useTranslations()`. E.g. `"support.starters.refund"`
 *    resolves `t("support.starters.refund")` from your own
 *    `messages/<locale>/support.json`. Keeping this to keys is what
 *    keeps starters translatable without editing `chat-thread.tsx`.
 *  - `headerRight`: a component the header renders on its right side,
 *    next to the History/New/Delete controls — a progress indicator,
 *    an export button reading product state for `conversationId`.
 *  - `attachments`: what the composer lets the reader attach. Unset,
 *    the "+" control is hidden. Mirror the server's policy in
 *    `lib/chat-server-config.ts` (`attachments.accept`, `maxBytes`,
 *    `mode`): the composer keeps the reader from picking a file the
 *    route would refuse, and in `stored` mode uploads it first.
 *  - `activity`: how reasoning, tool calls and runtime steps read in
 *    the transcript — `inline` (each as its own card, the default) or
 *    `timeline` (grouped into one collapsible activity block per
 *    reply, the way an agent's work is usually shown).
 *  - `commands`: slash commands the composer offers when a message
 *    starts with `/`. Each names a message key for its label and either
 *    inserts text or runs a callback.
 *  - `mentions`: an `@` picker — files, pages, knowledge bases — with a
 *    search you bind; the pick lands in the message as `@label` and in
 *    the turn's `body.mentions` for `resolveAgent`.
 *  - `sendAutomaticallyWhen`: an auto-continuation predicate, passed to
 *    `useChat`. Default: continue after tool results and after approval
 *    answers, which is what a tool loop and a gated tool need.
 *
 * Edit this file directly to point at your product's own components —
 * this is consumer-owned source, not a package import:
 *
 *   import { ExportReportButton } from "@/components/support/export-report-button";
 *
 *   export const chatConfig: ChatConfig = {
 *     agent: { id: "support-assistant", name: "Support Assistant", icon: "🎧" },
 *     starters: ["support.starters.refund", "support.starters.shipping"],
 *     headerRight: ExportReportButton,
 *     attachments: { accept: ["image/png", "image/jpeg", "application/pdf"], maxBytes: 5_000_000 },
 *   };
 */

import type { ComponentType } from "react";
import type { UIMessage } from "ai";

/** Props passed to a consumer-bound `headerRight` component. */
export interface ChatHeaderRightProps {
  conversationId: string;
}

export interface ChatAgentIdentity {
  /** Stable id for the agent this chat surface represents. */
  id?: string;
  /** Display name. Falls back to this item's translated default when omitted. */
  name?: string;
  /** A short icon or emoji shown beside the name. */
  icon?: string;
}

export interface ChatAttachmentsConfig {
  /** Media types the composer accepts, e.g. `["image/png", "application/pdf"]`. */
  accept: string[];
  maxFiles?: number;
  /** In bytes. */
  maxBytes?: number;
  /**
   * `inline` (default): files travel in the message as data URLs.
   * `stored`: files upload to `/api/chat/upload` first and the message
   * carries their app URL — bind a storage adapter and mount the two
   * routes (see `@intelligo-dev/chat`'s `createChatUploadHandler`).
   */
  mode?: "inline" | "stored";
  /** Where the composer uploads in `stored` mode. Default `/api/chat/upload`. */
  uploadUrl?: string;
}

export interface ChatCommand {
  /** Typed after `/`, e.g. `"summarize"`. */
  id: string;
  /** Message key for the label shown in the picker. */
  labelKey: string;
  /** Message key for a one-line description. */
  descriptionKey?: string;
  /** Text to put in the composer in place of `/id`. */
  insert?: string;
  /** Or run something — send a message, open a dialog. */
  run?: (context: {
    conversationId: string;
    setText: (text: string) => void;
    send: (text: string) => void;
  }) => void;
}

export interface ChatMention {
  id: string;
  label: string;
  description?: string;
  /** Grouped in the picker under this heading (a message key). */
  groupKey?: string;
}

export interface ChatMentionsConfig {
  /** Default `@`. */
  trigger?: string;
  search: (query: string) => Promise<ChatMention[]> | ChatMention[];
}

export interface ChatConfig {
  /** Identity shown in the conversation header. Omit for the default "Assistant" label. */
  agent?: ChatAgentIdentity;
  /** Conversation-starter message keys — see the module doc comment above. */
  starters?: string[];
  /** Rendered on the right side of the conversation header. */
  headerRight?: ComponentType<ChatHeaderRightProps>;
  /** What the composer lets the reader attach. Unset: no attachments. */
  attachments?: ChatAttachmentsConfig;
  /** How reasoning, tool calls and runtime steps read. Default `inline`. */
  activity?: "inline" | "timeline";
  /** Slash commands the composer offers. */
  commands?: ChatCommand[];
  /** The `@` picker. */
  mentions?: ChatMentionsConfig;
  /**
   * Auto-continuation predicate, passed straight to `useChat`'s
   * `sendAutomaticallyWhen`. Default: the SDK's own — continue when
   * the last assistant message finished with tool results, or with
   * approval answers, to give.
   */
  sendAutomaticallyWhen?: (options: {
    messages: UIMessage[];
  }) => boolean | PromiseLike<boolean>;
}

/**
 * The reference app's binding: an identity, and four starters from
 * `messages/en/chat.json`'s `starters` block (see the module doc
 * comment). The last one triggers the stub model's `saveArtifact` tool
 * call, so the tool → artifact → canvas path is one click from an
 * empty chat.
 */
export const chatConfig: ChatConfig = {
  agent: { id: "assistant", name: "Assistant", icon: "✨" },
  starters: [
    "chat.starters.explain",
    "chat.starters.draft",
    "chat.starters.brainstorm",
    "chat.starters.save",
  ],
};
