# @intelligo-dev/chat

The AI-SDK-native chat transport: a Route Handler as a function.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/chat ai
```

`ai` (the Vercel AI SDK) is a peer: the transport takes its tools, its models
and its stop conditions natively, and never wraps them (ADR-0003).

## Use

```ts
// app/api/chat/route.ts
import { createChatHandler } from "@intelligo-dev/chat";
import { chatServerConfig } from "@/lib/chat-server-config";

export const { POST, DELETE } = createChatHandler(chatServerConfig);
```

```ts
// lib/chat-server-config.ts
import type { ChatServerConfig } from "@intelligo-dev/chat";
import { composeIntelligo, executions } from "@/lib/intelligo";

export const chatServerConfig: ChatServerConfig = {
  executions,
  onRequest: composeIntelligo,
  model: { defaultId: "google/gemini-2.5-flash", resolve: getChatModel },
  agent: { id: "assistant", systemPrompt: "You are a helpful assistant." },
};
```

That is a working chat. Every turn goes through auth, the plan's rate limit,
the feature gate, conversation persistence (`@intelligo-dev/core/conversations`)
and the execution boundary (`executions.begin()` decides entitlement against
the model that is about to run, and settles exactly once).

## The seams

Each optional field is something a real product needed and used to fork the
route to get:

| Field                         | What it decides                                                          |
| ----------------------------- | ------------------------------------------------------------------------ |
| `resolveAgent(turn)`          | Which agent runs — from the body, the row, a table; prompt, tools, model |
| `prepareMessages(turn, msgs)` | What the model is shown — windowing, summaries, injected context         |
| `attachments`                 | Which file parts are accepted                                            |
| `reasoning`                   | Whether reasoning parts stream to the client                             |
| `deriveTitle`                 | The conversation's title, sync or model-written                          |
| `persist`                     | Where the turn's messages go                                             |
| `onTurn`                      | Telemetry: start, complete, fail, refuse                                 |
| `messages(request)`           | Refusal copy in the caller's locale                                      |
| `authenticate`, `rateLimit`   | The defaults are the framework's; a worker or a test can replace them    |

None carry product vocabulary; all close over the caller's tenancy, so the
model is never told which workspace it is in.

## Subpaths

- `@intelligo-dev/chat/client` — error codes, the quota-state shape and
  `parseChatError`, for a client bundle. Imports nothing.
- `@intelligo-dev/chat/testing` — `createStubLanguageModel`, a deterministic
  model that streams with no API key.

## Licence

Apache-2.0
