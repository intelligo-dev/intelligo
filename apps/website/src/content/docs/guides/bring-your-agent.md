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

### What a turn sends

Every model call in a tool loop sends the system prompt, every tool's definition and the whole history again, so a long conversation with large tool outputs grows each turn. The transport leaves these choices to you, because they are prompt decisions:

- **Fewer tools per turn.** `resolveAgent` can return `activeTools` from the turn's state: the tools the conversation's stage needs, not all of them. A set that stays the same within a stage also keeps a prompt cache warm. On Mastra, the agent's `tools` can be a function of its `requestContext`.
- **Prompt caching.** The transport sets no cache breakpoint, since that would name a provider. `agent.generation.prepareStep` sees each step's model messages: return them with the provider's cache option in `providerOptions` on the newest user message, and the system prompt as a system message carrying the same. On Mastra, pass `instructions` that way through `streamOptions` and leave `prepared.system` unset, because a prepared system prompt replaces them. The cache counts the provider reports are priced at the model's cache rates (see [models and pricing](/docs/guides/models-and-pricing)).
- **Older tool outputs.** `prepareMessages` can replace the output of a tool call older than the last few turns with a short stand-in, keeping each call and its result paired; the app's own tables still hold the data for a tool to read again. A stand-in that moves with every turn changes the cached prefix each time, so compact at fixed points rather than by a rolling window when you also cache. Tell the model that a shortened output is shortened, not wrong.
- **Data parts stay out.** `data-*` parts reach the reader, not the model: neither `streamText` nor the Mastra binding converts them into the model's context.

### A card that ends the turn

A tool that draws a question or a choice and waits for the reader should end the turn there, or the model takes another step and writes under the card. Add `hasToolCall("<tool>")` from `ai` to the agent's `stopWhen`; on Mastra, use the agent's own stop condition. The thread does not resend a turn that ended on a server-run tool.

### Tool labels on the server

A tool's `label` in `TOOL_RENDERERS` is a message key the client translates. To use the same words on the server, in a summary the agent writes or a notification, read them with next-intl's `getTranslations({ locale, namespace })`, as `lib/chat-server-config.ts` does for its own strings. Keep the keys in your messages, not in the client module.

### The assistant route

`app/api/assistant`, the `assistantMessage` capability, its feature key and the echo model are the scaffold's worked example of a model call outside chat through the execution boundary. They are one unit: keep them as the pattern for a one-shot call, or remove them together.

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

The turn settles the whole run's usage, every model call of a tool loop rather than the last, and a stopped turn settles the steps that finished. `memory: true` keeps the thread in Mastra memory under the conversation, with the workspace and the user together as the resource, and sends only the new message. `streamOptions(turn, prepared)` passes more of `agent.stream`'s options, such as `modelSettings` or a `requestContext` with values of your own.

Every run's `requestContext` carries the turn's `workspaceId`, `userId` and `conversationId`, set over yours. A tool reads them with `chatActorOf(context)`, which throws when the workspace or the user is missing, so a tool never runs unscoped. A tool writes a data part, such as a card or an artifact, through Mastra's `context.writer.custom({ type: "data-…", data })`; the reader receives it like any other part. Data parts never reach the model's context, on this path or on `streamText`; a product that wants one there adds it in `prepareMessages`.

The binding passes `reasoning` and `sources` from the chat server config to Mastra, so reasoning reaches the reader only when `reasoning: true` is set. Tools that require approval are Mastra's suspend and resume, which the binding does not bridge: a tool that needs the reader's confirmation asks through a question part and acts on the next turn's answer.

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
