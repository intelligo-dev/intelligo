/**
 * The chat Route Handler — two lines, on purpose.
 *
 * Every decision a turn involves (auth, the plan's rate limit, the
 * feature gate, conversation persistence, entitlement at
 * `executions.begin()`, streaming, settlement) lives in
 * `@intelligo-dev/chat`, and everything this deployment decides about
 * it — model, agent, tools, prompt, attachments, title, telemetry,
 * copy — lives in `@/lib/chat-server-config`, consumer-owned source you
 * edit instead of this file (ADR-0012).
 *
 * `maxDuration` is the one thing that belongs here: it is a Next.js
 * route segment option, and a streamed reply with tools can outlast
 * the platform default.
 */

import { createChatHandler } from "@intelligo-dev/chat";

import { chatServerConfig } from "@/lib/chat-server-config";

export const maxDuration = 300;

export const { POST, DELETE } = createChatHandler(chatServerConfig);
