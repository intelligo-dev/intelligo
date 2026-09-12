/**
 * Chat composition config — the consumer-owned extension point for
 * everything a vertical wants to add to the chat surface without
 * editing `components/chat/chat-panel.tsx` or
 * `components/chat/conversation-header.tsx` (ADR-0005: composition
 * through a config a consumer owns, never a component edit).
 *
 * Three seams, all optional — a fresh install ships this file with an
 * empty `chatConfig`, so the chat surface renders nothing extra beyond
 * its baseline UI:
 *
 *  - `agent`: the identity shown in the conversation header — a
 *    name and optional icon/emoji. Omit it (the default) and the
 *    header falls back to this item's own translated "Assistant"
 *    label (`messages/en/chat.json`'s `agent.defaultName`) — that
 *    fallback is why `name`/`icon` are plain strings here rather than
 *    routed through this item's messages file: once you bind your own
 *    product's agent identity, its copy is your product's copy to
 *    localize however you like — the agent's display name is product
 *    copy, not framework copy.
 *  - `starters`: conversation-starter prompts shown on an empty
 *    conversation, as *message keys* — not literal strings — resolved
 *    against your app's full message tree via next-intl's
 *    namespace-less `useTranslations()`. E.g. `"support.starters.refund"`
 *    resolves `t("support.starters.refund")` from your own
 *    `messages/<locale>/support.json`. Keeping this to keys (never
 *    literal display text) is what keeps starters translatable without
 *    editing `chat-panel.tsx`. Default: no starters — the empty-state
 *    card just shows its title and description.
 *  - `headerRight`: a component `conversation-header.tsx` renders on
 *    the right side of the header, next to the History/New/Delete
 *    controls, e.g. a progress indicator or an export button reading
 *    product state for `conversationId`. Default: nothing extra.
 *
 * Edit this file directly to point at your product's own components —
 * this is consumer-owned source, not a package import. Example, once
 * you have a product-specific header component:
 *
 *   import { ExportReportButton } from "@/components/support/export-report-button";
 *
 *   export const chatConfig: ChatConfig = {
 *     agent: { id: "support-assistant", name: "Support Assistant", icon: "🎧" },
 *     starters: ["support.starters.refund", "support.starters.shipping"],
 *     headerRight: ExportReportButton,
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

export interface ChatConfig {
  /** Identity shown in the conversation header. Omit for the default "Assistant" label. */
  agent?: ChatAgentIdentity;
  /** Conversation-starter message keys — see the module doc comment above. */
  starters?: string[];
  /** Rendered on the right side of the conversation header. */
  headerRight?: ComponentType<ChatHeaderRightProps>;
  /**
   * Auto-continuation predicate, passed straight to `useChat`'s
   * `sendAutomaticallyWhen`. A product whose tools advance the
   * conversation without user input (e.g. a selection tool that should
   * immediately trigger the next assistant turn) binds its predicate
   * here. Default: no automatic sends.
   */
  sendAutomaticallyWhen?: (options: {
    messages: UIMessage[];
  }) => boolean | PromiseLike<boolean>;
}

/**
 * Default chat configuration — a fresh install has no product identity,
 * starters, or header component to add.
 */
export const chatConfig: ChatConfig = {};
