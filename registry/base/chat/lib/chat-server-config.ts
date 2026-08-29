import "server-only";

/**
 * Server-side chat config — consumer-owned, read only by
 * `app/api/chat/route.ts`.
 *
 * Separate from `lib/chat-config.tsx` on purpose: that file is
 * client-facing (it binds React components — a header slot, starter
 * keys, an agent identity), and importing it from the Route Handler
 * would drag client modules into the server bundle. Everything the
 * route needs and the browser must never see lives here instead.
 *
 * The seam that matters most is `tools`. Without it, `streamText` runs
 * with no tools at all, which makes the tool-renderer seam in
 * `lib/chat-renderers.tsx` unreachable — you could register a renderer
 * but nothing would ever call a tool for it to render. Bind tools here
 * and the whole path works without editing a shipped file:
 *
 *   import { tool } from "ai";
 *   import { z } from "zod";
 *
 *   export const chatServerConfig: ChatServerConfig = {
 *     ...defaults,
 *     tools: ({ workspaceId }) => ({
 *       searchDocs: tool({
 *         description: "Search the workspace's documents",
 *         inputSchema: z.object({ query: z.string() }),
 *         execute: async ({ query }) => search(workspaceId, query),
 *       }),
 *     }),
 *   };
 *
 * `tools` may be a plain `ToolSet` or a function of the turn's context
 * (workspace, user, conversation) — the function form is what lets a
 * tool close over the caller's tenancy instead of taking it as a model
 * argument the model could get wrong.
 *
 * `deriveTitle` names a conversation from its first user message when
 * the row is created. The default truncates; a product that wants
 * model-generated titles can call its own summarizer here (it runs
 * server-side, before the stream opens, so keep it fast).
 */

import type { ToolSet } from "ai";

export interface ChatToolContext {
  workspaceId: string;
  userId: string;
  conversationId: string;
}

export interface ChatServerConfig {
  /** System prompt for every turn. */
  systemPrompt: string;
  /** Plan feature key gating the whole chat surface. */
  featureKey: string;
  /** Capability name recorded on each execution. */
  capability: string;
  /** Agent id stored on conversations this route creates. */
  agentId: string;
  /** Longest message accepted, in characters. */
  maxMessageLength: number;
  /**
   * How many model steps a single turn may take (a tool call and the
   * reply that uses its result are two). Only meaningful with `tools`.
   */
  maxSteps: number;
  /** Tools the model may call, or a function of the turn's context. */
  tools?: ToolSet | ((context: ChatToolContext) => ToolSet | Promise<ToolSet>);
  /** Title for a newly created conversation, from its first message. */
  deriveTitle: (firstUserText: string) => string | null;
}

const MAX_TITLE_LENGTH = 60;

/** First line, trimmed, truncated — enough to tell rows apart. */
function truncateTitle(firstUserText: string): string | null {
  const line = firstUserText.trim().split("\n")[0]?.trim();
  if (!line) return null;
  return line.length <= MAX_TITLE_LENGTH
    ? line
    : `${line.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`;
}

export const chatServerConfig: ChatServerConfig = {
  systemPrompt:
    "You are a helpful assistant embedded in a SaaS product. Be concise and direct.",
  featureKey: "chat",
  capability: "chat.message",
  agentId: "assistant",
  maxMessageLength: 8000,
  maxSteps: 5,
  deriveTitle: truncateTitle,
};
