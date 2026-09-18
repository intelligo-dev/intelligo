/**
 * `chat-config.tsx` is a consumer-owned seam (see
 * packages/registry/base/chat/lib/chat-config.tsx's own doc comment) —
 * the registry ships it as an empty scaffold (`chatConfig = {}`) for a
 * fresh install to edit. This film's Editor act already shows that
 * edit happening (lib/chat-config.tsx, agent.name typed in); this file
 * is what the edit lands on, so the real chat page it feeds actually
 * reflects it instead of the registry's untouched default.
 */
import type { ComponentType } from "react";
import type { UIMessage } from "ai";

export interface ChatHeaderRightProps {
  conversationId: string;
}
export interface ChatAgentIdentity {
  id?: string;
  name?: string;
  icon?: string;
}
export interface ChatAttachmentsConfig {
  accept: string[];
  maxFiles?: number;
  maxBytes?: number;
  mode?: "inline" | "stored";
  uploadUrl?: string;
}
export interface ChatCommand {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  insert?: string;
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
  groupKey?: string;
}
export interface ChatMentionsConfig {
  trigger?: string;
  search: (query: string) => Promise<ChatMention[]> | ChatMention[];
}
export interface ChatConfig {
  agent?: ChatAgentIdentity;
  starters?: string[];
  headerRight?: ComponentType<ChatHeaderRightProps>;
  attachments?: ChatAttachmentsConfig;
  activity?: "inline" | "timeline";
  commands?: ChatCommand[];
  mentions?: ChatMentionsConfig;
  sendAutomaticallyWhen?: (options: {
    messages: UIMessage[];
  }) => boolean | PromiseLike<boolean>;
}

export const chatConfig: ChatConfig = {
  agent: { id: "contract-copilot", name: "Contract Copilot", icon: "📄" },
};
