import "server-only";

/**
 * Server-side chat config for the reference app — the `chat` item's
 * consumer seam, bound rather than left on defaults.
 *
 * The binding that matters is `tools`. The registry ships this file
 * with none, which leaves the tool-renderer seam unreachable (nothing
 * ever calls a tool for a renderer to render) and the `artifacts` page
 * permanently empty (nothing ever writes a document). Binding
 * `saveArtifact` closes both: the stub model in `lib/chat-model.ts`
 * calls it whenever a message starts with "save", so a clean install
 * with no API keys still demonstrates the whole path — tool call →
 * document written through `@intelligo-dev/core` (ADR-0009) →
 * `ArtifactLinkCard` in the transcript → the document on `/artifacts`.
 *
 * Swapping the stub for a real provider changes nothing here: the tool
 * closes over the turn's workspace and user, so the model never
 * supplies (or gets wrong) the tenancy.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";

import { saveDocument } from "@intelligo-dev/core/documents";

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

/**
 * Document ids are minted per call, so each save is its own artifact —
 * the model has no stable identity to key on, and silently overwriting
 * an earlier document would be worse than keeping two. (The manual
 * "Save" action in the message action row keys on the message id
 * instead, so re-saving one reply versions it.)
 */
function artifactTools(context: ChatToolContext): ToolSet {
  return {
    saveArtifact: tool({
      description:
        "Save a document artifact for the user — a note, summary, draft, or any text worth keeping outside the conversation.",
      inputSchema: z.object({
        title: z.string().min(1).max(200),
        content: z.string().min(1),
      }),
      execute: async ({ title, content }) => {
        const saved = await saveDocument(
          { workspaceId: context.workspaceId, userId: context.userId },
          { id: crypto.randomUUID(), title, content, kind: "text" }
        );
        return { id: saved.id, title: saved.title };
      },
    }),
  };
}

export const chatServerConfig: ChatServerConfig = {
  systemPrompt:
    "You are a helpful assistant embedded in a SaaS product. Be concise and direct. " +
    "When the user asks you to save, note, or keep something, call the saveArtifact tool.",
  featureKey: "chat",
  capability: "chat.message",
  agentId: "assistant",
  maxMessageLength: 8000,
  maxSteps: 5,
  tools: artifactTools,
  deriveTitle: truncateTitle,
};
