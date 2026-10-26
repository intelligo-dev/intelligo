---
title: Bring your agent
description: Replace the stub model with your provider, prompt and tools — in the chat's server config, with Mastra, or around any run of your own.
order: 1
---

A fresh install chats against a deterministic stub model. Everything that makes it your agent lives in files you own.

## In the chat

`app/api/chat/route.ts` is two lines and stays that way:

<!-- snippet: packages/registry/base/chat/route.ts -->

```ts title="app/api/chat/route.ts"
import { createChatHandler } from "@intelligo-dev/chat";

import { chatServerConfig } from "@/lib/chat-server-config";

export const maxDuration = 300;

export const { POST, DELETE } = createChatHandler(chatServerConfig);
```

Every turn goes through auth, the plan's rate limit, the feature gate, conversation persistence and the execution boundary inside `createChatHandler`. You change what the turn _does_ in `lib/chat-server-config.ts`:

```ts title="lib/chat-server-config.ts"
import { tool } from "ai";
import { z } from "zod";

export const chatServerConfig: ChatServerConfig = {
  executions,
  onRequest: composeIntelligo,
  model: { defaultId: "google/gemini-2.5-flash", resolve: getChatModel },
  agent: {
    id: "support",
    systemPrompt: "You answer from the workspace's documents.",
    tools: ({ workspaceId }) => ({
      searchDocs: tool({
        description: "Search the workspace's documents",
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }) => search(workspaceId, query),
      }),
    }),
  },
};
```

Tools are native AI SDK tools. The function form closes over the caller's tenancy, so the model is never told — and can never get wrong — which workspace it is in. Give a tool a card with a [tool renderer](/docs/registry/tool-renderers).

### Register the model

Every model id must be registered with its pricing before it runs. `registerModels(DEFAULT_MODELS)` in the composition root covers the built-in catalogue; pass your own entries for contracted rates or a model it doesn't know. An unregistered id has no price, so the chat refuses the turn rather than guess a rate, and an architecture test catches literals at build time. [Models and pricing](/docs/guides/models-and-pricing) covers swapping the stub for a provider model, the pricing fields and the model picker.

### More seams

| Field                         | Use it when                                                         |
| ----------------------------- | ------------------------------------------------------------------- |
| `resolveAgent(turn)`          | More than one agent — pick prompt, tools and model per conversation |
| `streamTurn(turn, prepared)`  | Another runtime than `streamText`, such as a Mastra agent           |
| `models`                      | Letting the reader pick among allowed models                        |
| `prepareMessages(turn, msgs)` | Windowing, summaries or injected context                            |
| `agent.generation`            | Temperature, a token ceiling, a tool choice, a seed                 |
| `attachments`                 | Accepting files, optionally stored and signed for the model only    |
| `deriveTitle`                 | A model-written conversation title                                  |
| `onTurn`                      | Telemetry for start, complete, fail, refuse, approval and feedback  |

Anything user-authored that reaches a system prompt — a stored summary, profile context — goes through `sanitizeForSystemPrompt()` from `@intelligo-dev/core/prompt` first.

## With Mastra

In the chat, a Mastra agent runs the turn through the `chat-mastra` item, and the transport keeps auth, admission, persistence and settlement:

```bash
pnpm exec shadcn add @intelligo/chat-mastra
```

```ts title="lib/chat-server-config.ts"
import { mastraStreamTurn } from "@/lib/chat-mastra";
import { mastra } from "@/mastra";

export const chatServerConfig: ChatServerConfig = {
  executions,
  // The registered model the agent is built on: admission prices it.
  model: { defaultId: "anthropic/claude-haiku-5-5" },
  streamTurn: mastraStreamTurn({
    agent: (turn) => mastra.getAgent(turn.agent.id),
    maxSteps: 6,
    memory: true,
  }),
};
```

The turn settles the whole run's usage, every model call of a tool loop rather than the last, and a stopped turn settles the steps that finished. `memory: true` keeps the thread in Mastra memory under the conversation, with the workspace and the user together as the resource, and sends only the new message. `streamOptions(turn, prepared)` passes more of `agent.stream`'s options, such as a `requestContext` that carries the workspace to the tools. Tools that require approval are Mastra's suspend and resume, which the binding does not bridge.

Outside the chat, `@intelligo-dev/mastra` brackets a native Mastra call without importing Mastra:

```ts
import { runWithExecution } from "@intelligo-dev/mastra";

const result = await runWithExecution(
  { executions, workspaceId, userId, capability: "support.reply" },
  () => supportAgent.generate(messages), // native Mastra, untouched
);
```

A refusal throws `ExecutionRefusedError`, so it can't be mistaken for an empty result. `streamWithExecution` does the same for streams.

## Anywhere else

A background job, a webhook, another framework: call the [execution boundary](/docs/concepts/execution-boundary) directly — `begin`, then `complete` or `fail`.
