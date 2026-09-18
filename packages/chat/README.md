# @intelligo-dev/chat

The AI-SDK-native chat transport: a Route Handler as a function.

Part of [Intelligo](https://github.com/intelligo-mn/framework), an application
framework and operational platform for vertical AI SaaS products. This package
is published from that repository and is not meant to be used on its own.

## Install

```bash
pnpm add @intelligo-dev/chat@beta ai
```

`ai` (the Vercel AI SDK) is a peer: the transport takes its tools, its models
and its stop conditions natively, and never wraps them.

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

| Field                         | What it decides                                                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveAgent(turn)`          | Which agent runs — from the body, the row, a table; prompt, tools, model                                                                                      |
| `streamTurn(turn, prepared)`  | Another runtime than `streamText` — a Mastra agent, an eve session — returning the AI SDK's chunks and the run's usage; everything else stays the transport's |
| `models`                      | The models a request may pick; anything else is `FEATURE_GATED` (`model_not_allowed`)                                                                         |
| `prepareMessages(turn, msgs)` | What the model is shown — windowing, summaries, injected context                                                                                              |
| `agent.generation`            | How the model samples — temperature, a token ceiling, a tool choice, a seed: an allowlist of the `streamText` options that do not touch settlement            |
| `attachments`                 | Which file parts are accepted; `mode: "stored"` uploads them through the storage port and signs URLs for the model only                                       |
| `reasoning`, `sources`        | Whether reasoning and source parts stream to the client                                                                                                       |
| `messageMetadata`             | `{ modelId, usage, finishedAt }` on the reply (default on)                                                                                                    |
| `cors`                        | Origins an embedded widget may call from                                                                                                                      |
| `deriveTitle`                 | The conversation's title, sync or model-written                                                                                                               |
| `persist`                     | Where the turn's messages go                                                                                                                                  |
| `onTurn`                      | Telemetry: start, complete, fail, refuse, approval, feedback                                                                                                  |
| `messages(request)`           | Refusal copy in the caller's locale                                                                                                                           |
| `authenticate`, `rateLimit`   | The defaults are the framework's; a worker or a test can replace them                                                                                         |

None carry product vocabulary; all close over the caller's tenancy, so the
model is never told which workspace it is in.

A tool reaches the client mid-turn through the turn: `turn.write()` sends a
`data-chat-*` part (a status line, a plan), and `createArtifactWriter(turn,
{ kind, title })` streams a document into the chat's canvas — `append`
deltas, `finish({ documentId })`. `sanitizeForShare` strips a transcript
for a public page; `recordChatFeedback` records a vote and tells the hook.
Stored attachments mount two more handlers, `createChatUploadHandler` and
`createChatAttachmentHandler`.

## Subpaths

- `@intelligo-dev/chat/client` — error codes, the quota-state shape,
  `parseChatError`, the `data-chat-*` parts vocabulary (`ChatUIMessage`,
  `isChatDataPart`) and `ChatModelOption`, for a client bundle. Imports
  nothing at runtime.
- `@intelligo-dev/chat/testing` — `createStubLanguageModel`, a deterministic
  model that streams with no API key.

## Licence

Apache-2.0
