---
title: Bring your agent
description: Replace the stub model with your provider, prompt and tools — in the chat's server config, with Mastra, or around any run of your own.
order: 1
---

A fresh install chats against a deterministic stub model. Everything that makes it your agent lives in files you own.

## In the chat

`app/api/chat/route.ts` is two lines and stays that way:

```ts
import { createChatHandler } from "@intelligo-dev/chat";
import { chatServerConfig } from "@/lib/chat-server-config";

export const { POST, DELETE } = createChatHandler(chatServerConfig);
```

Every turn goes through auth, the plan's rate limit, the feature gate, conversation persistence and the execution boundary inside `createChatHandler`. You change what the turn *does* in `lib/chat-server-config.ts`:

```ts
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

Every model id must be registered with its pricing before it runs. `registerModels(DEFAULT_MODELS)` in the composition root covers the built-in catalogue; pass your own entries for contracted rates or a model it doesn't know. An unregistered id throws where its price is needed, and an architecture test catches literals at build time.

### More seams

| Field | Use it when |
| --- | --- |
| `resolveAgent(turn)` | More than one agent — pick prompt, tools and model per conversation |
| `streamTurn(turn, prepared)` | Another runtime than `streamText`, such as a Mastra agent |
| `models` | Letting the reader pick among allowed models |
| `prepareMessages(turn, msgs)` | Windowing, summaries or injected context |
| `attachments` | Accepting files, optionally stored and signed for the model only |
| `deriveTitle` | A model-written conversation title |
| `onTurn` | Telemetry for start, complete, fail, refuse, approval and feedback |

Anything user-authored that reaches a system prompt — a stored summary, profile context — goes through `sanitizeForSystemPrompt()` from `@intelligo-dev/core/prompt` first.

## With Mastra

`@intelligo-dev/mastra` brackets a native Mastra call without importing Mastra:

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
