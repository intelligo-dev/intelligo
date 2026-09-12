import "server-only";

/**
 * Server-side chat config — consumer-owned, read by
 * `app/api/chat/route.ts` through `createChatHandler`.
 *
 * Separate from `lib/chat-config.tsx` on purpose: that file is
 * client-facing (it binds React components — a header slot, starter
 * keys, an agent identity), and importing it from the Route Handler
 * would drag client modules into the server bundle. Everything the
 * transport needs and the browser must never see lives here instead.
 *
 * Two fields are required — the execution boundary and a way to turn
 * a model id into a model — because those are the two things the
 * framework must never guess. Everything else has a default that gives
 * a fresh install a working chat with no API keys: one agent, one
 * prompt, no tools, a forty-message window, a truncated first line as
 * the title.
 *
 * The seam that matters most is `agent.tools`. Without it the model
 * runs with no tools, which makes the tool-renderer seam in
 * `lib/chat-renderers.tsx` unreachable — you could register a renderer
 * but nothing would ever call a tool for it to render. Bind tools here
 * and the whole path works without editing a shipped file:
 *
 *   import { tool } from "ai";
 *   import { z } from "zod";
 *
 *   agent: {
 *     systemPrompt: "…",
 *     tools: ({ workspaceId }) => ({
 *       searchDocs: tool({
 *         description: "Search the workspace's documents",
 *         inputSchema: z.object({ query: z.string() }),
 *         execute: async ({ query }) => search(workspaceId, query),
 *       }),
 *     }),
 *   },
 *
 * `tools` may be a plain `ToolSet` or a function of the turn (workspace,
 * user, conversation) — the function form is what lets a tool close
 * over the caller's tenancy instead of taking it as a model argument
 * the model could get wrong.
 *
 * Past one agent, bind `resolveAgent` instead of `agent`: it receives
 * the turn (the transport's extra body fields such as `agentId`, the
 * existing conversation row) and returns the prompt, tools and model
 * for this turn. `prepareMessages` decides what the model is shown —
 * windowing is the default; a product that summarises pruned history
 * or injects profile context does it there. See `ChatServerConfig` in
 * `@intelligo-dev/chat` for every seam.
 *
 * i18n: the route lives at `app/api/chat/route.ts`, outside the
 * `[locale]` segment (ADR-0010), so there is no URL segment to read a
 * locale from. `messages` below reads the `NEXT_LOCALE` cookie
 * next-intl's middleware already sets on every page navigation, then
 * falls back to the configured default locale — the same "works with
 * nothing extra" guarantee a single-locale deployment gets everywhere
 * else.
 */

import type { ChatMessages, ChatServerConfig } from "@intelligo-dev/chat";
import { getTranslations } from "next-intl/server";

import { routing } from "@/i18n/routing";
import { CHAT_MODEL_ID, getChatModel } from "@/lib/chat-model";
import { composeIntelligo, executions } from "@/lib/intelligo";

function localeFrom(request: Request): string {
  const cookieName =
    typeof routing.localeCookie === "object"
      ? (routing.localeCookie.name ?? "NEXT_LOCALE")
      : "NEXT_LOCALE";
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  const value = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  const locales: readonly string[] = routing.locales;
  return value && locales.includes(value) ? value : routing.defaultLocale;
}

/** Refusal copy from this item's `chat` namespace, in the caller's locale. */
async function chatMessages(request: Request): Promise<ChatMessages> {
  const t = await getTranslations({
    locale: localeFrom(request),
    namespace: "chat",
  });
  return (key, params) => t(`route.${key}`, params);
}

export const chatServerConfig: ChatServerConfig = {
  executions,
  onRequest: composeIntelligo,
  model: { defaultId: CHAT_MODEL_ID, resolve: getChatModel },
  messages: chatMessages,

  featureKey: "chat",
  capability: "chat.message",
  maxMessageLength: 8000,
  maxSteps: 5,

  agent: {
    id: "assistant",
    systemPrompt:
      "You are a helpful assistant embedded in a SaaS product. Be concise and direct.",
  },
};
