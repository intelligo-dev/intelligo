# @intelligo-dev/chat

The AI-SDK-native chat transport: one Route Handler with auth, rate limits, feature gates, credits and persistence.

Part of [Intelligo](https://intelligo.dev), an application framework and
operational platform for vertical AI SaaS products. Every `@intelligo-dev/*`
package is released at one version and shares one database schema;
`pnpm dlx @intelligo-dev/cli create my-app` installs the set an
application needs. Documentation:
[intelligo.dev/docs/packages/chat](https://intelligo.dev/docs/packages/chat).

## Install

```bash
pnpm add @intelligo-dev/chat ai
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
the model that is about to run, and settles exactly once). The model reads
the conversation as it was stored: each message before the one being sent
is read back by id, and one the conversation does not hold is left out, so
a client cannot put words or tool results in the transcript it never had. A
deployment with its own `persist` reads its own store in `prepareMessages`.

## The seams

Each optional field is something a real product needed and used to fork the
route to get:

| Field                         | What it decides                                                                                                                                                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolveAgent(turn)`          | Which agent runs — from the body, the row, a table; prompt, tools, model                                                                                                                                                            |
| `streamTurn(turn, prepared)`  | Another runtime than `streamText` — a Mastra agent, an eve session — returning the AI SDK's chunks and the run's usage; everything else stays the transport's                                                                       |
| `models`                      | The models a request may pick; anything else is `FEATURE_GATED` (`model_not_allowed`)                                                                                                                                               |
| `prepareMessages(turn, msgs)` | What the model is shown — windowing, summaries, injected context                                                                                                                                                                    |
| `numberCheck`                 | Whether a reply's numbers must come from the system prompt, the reader's words or a tool output on record; a reply holding any other gets `note(numbers, turn)` under it. `vocabularies` sets the languages (English by default)    |
| `agent.generation`            | How the model samples — temperature, a token ceiling, a tool choice, a seed: an allowlist of the `streamText` options that do not touch settlement. `maxOutputTokens` defaults to the registered model's, the figure admission held |
| `attachments`                 | Which file parts are accepted; `mode: "stored"` uploads them through the storage port and signs URLs for the model only. The upload route applies its own `rateLimit`, the `featureKey` gate, `maxUnclaimedBytes` and `admitUpload` |
| `maxBodyBytes`                | The largest request body read, after the caller is authenticated; 8 MiB plus four inline files at the policy's size by default                                                                                                      |
| `reasoning`, `sources`        | Whether reasoning and source parts stream to the client                                                                                                                                                                             |
| `messageMetadata`             | `{ modelId, usage, finishedAt }` on the reply (default on)                                                                                                                                                                          |
| `cors`                        | Origins an embedded widget may call from                                                                                                                                                                                            |
| `deriveTitle`                 | The conversation's title, sync or model-written                                                                                                                                                                                     |
| `persist`                     | Where the turn's messages go                                                                                                                                                                                                        |
| `onTurn`                      | Telemetry: start, complete, fail, refuse, approval, feedback                                                                                                                                                                        |
| `messages(request)`           | Refusal copy in the caller's locale                                                                                                                                                                                                 |
| `authenticate`, `rateLimit`   | The defaults are the framework's; a worker or a test can replace them                                                                                                                                                               |

None carry product vocabulary; all close over the caller's tenancy, so the
model is never told which workspace it is in.

`resolveAgent`, `agent.tools(turn)` and `deriveTitle` receive a `ChatTurnContext`; the later
seams — `prepareMessages`, `streamTurn`, `persist` — receive a `ChatTurn`, which
is the same context plus the resolved agent and `history()`. The context
carries `workspaceId` and `userId`, the `request`, the `conversationId` and its
row (`conversation`, null on the first turn), the `trigger`, and `body`: the
fields the client sent beyond the AI SDK's own, such as `ChatPanel`'s `body`
prop, which is how a page tells a tool which record it is about. `body` is the
caller's input, so a tool reads a record through the turn's workspace, never
by the id alone. Beside them sit `write`, `updateMetadata`, `state` and
`addUsage`:

```ts
agent: {
  tools: (turn) => ({
    summarize: tool({
      inputSchema: z.object({ section: z.string() }),
      execute: async ({ section }) => {
        // Scoped to the caller's workspace: an id from `body` is untrusted.
        const record = await getRecord(turn.workspaceId, String(turn.body.recordId));
        if (!record) return { error: "not found" };
        const { text, usage } = await summarize(record, section);
        turn.addUsage(usage, { model: "google/gemini-2.5-flash" });
        return text;
      },
    }),
  }),
},
```

A tool reaches the client mid-turn through the turn: `turn.write()` sends a
`data-chat-*` part (a status line, a plan), and `createArtifactWriter(turn,
{ kind, title })` streams a document into the chat's canvas — `append`
deltas, `finish({ documentId })`. A tool that calls a model itself — a
grounded search, a sub-agent, an embedding for retrieval — hands its tokens
to `turn.addUsage(usage, { model })`. Tokens on the turn's own model (or
with no `model`) settle with the turn's; tokens on another registered model
are summed per model and recorded as that model's own execution
(`capability` `"chat.embedding"` for an embedding model, `parentExecutionId`
in its metadata) when the turn settles. Tokens `prepareMessages` reports
before a turn that admission then refuses are recorded the same way, as
already spent, so a refused turn still pays for its summary. An
unregistered `model` throws `UnknownModelError` at the call rather than
bill at another model's price.

`turn.state` is a `Map` that lives for one request and is shared by every
seam that receives the turn — `resolveAgent`, `prepareMessages`, tools,
`streamTurn`, `persist`, the `onTurn` events — so what one of them reads
(a profile, a retrieval result) the next can use without a second query.

### Numbers from tools only

A product whose figures must come from its tools — prices, salaries,
scores — can forbid made-up numbers in the prompt, and `numberCheck`
checks it after the fact:

```ts
numberCheck: {
  note: (numbers) =>
    `_Check these figures: ${numbers.join(", ")} came from no tool._`,
  vocabularies: [ENGLISH_NUMBERS, MONGOLIAN_NUMBERS],
},
```

When a reply ends, every number in it is compared by value and unit with
the system prompt, the reader's own messages and every tool output on
record, this turn's included. A tool part the client posted counts only
as the stored transcript says it ran, and the assistant's earlier words
are never a source. A reply holding any other number gets the note as
one more text part of the same message, which is persisted with it; the
text already streamed is not rewritten.

Values match however they are written (`$2,500,000`, `2.5 million`,
`2 500 000 USD`), and a unit must match too: a tool's `priceUsd: 25` does
not source "25%". Units come from currency signs and codes, `%`, the
field's name (`minMnt`, `sharePercent`, `testScore`, `startYear`) and the
vocabulary's words. A small count (0–12) and a year said as a year pass
bare; a date is checked whole; an amount spelled out in words is
refused. Ids, slugs, links and UUIDs source nothing. A `NumberVocabulary`
is a language's scale words, unit words, year and date phrasing and
number words; `ENGLISH_NUMBERS` is the default and `MONGOLIAN_NUMBERS`
ships beside it. `numberCheckStream`, `unsourcedNumbers` and
`createNumberReader` are exported for a runtime that checks outside the
transport.

`sanitizeForShare` strips a transcript
for a public page; who a share link opens for is
`setConversationSharing` from `@intelligo-dev/core/conversations`, bound in
the composition root: `"public"` (anyone with the link, the default),
`"workspace"` (signed-in members of the conversation's workspace) or `"off"`
(no link opens, publishing is refused and the share button is not shown).
`recordChatFeedback` records a vote and tells the hook.
Stored attachments mount two more handlers, `createChatUploadHandler` and
`createChatAttachmentHandler`.

## Refusals

Every non-2xx answer is `{ error, code, reasonCode? }` with one status per
code (`CHAT_ERROR_CODES`, `parseChatError`). Admission's refusals split by
who can fix them:

| Admission code                               | Answer                       | Whose problem                               |
| -------------------------------------------- | ---------------------------- | ------------------------------------------- |
| `insufficient_credits`, `allowance_depleted` | 402 `QUOTA_EXCEEDED`         | The workspace's: upgrade or top up          |
| `billing_not_configured`                     | 503 `BILLING_NOT_CONFIGURED` | The deployment's: no product or plans       |
| `unknown_model`                              | 503 `MODEL_UNAVAILABLE`      | The deployment's: the model id has no price |

The two 503s are logged at error level — `unknown_model` with the model id
— and `MODEL_UNAVAILABLE` answers with neutral copy (`modelUnavailable`)
rather than the engine's reason, which names the registry. `reasonCode`
carries the admission code either way.

`getChatQuotaState({ modelId })` is the same decision as a read, for a
page that wants to say so before a turn is spent; `getChatQuotaStates({
modelIds })` reads it once per model a picker offers.

## Subpaths

- `@intelligo-dev/chat/client` — error codes, the quota-state shape,
  `parseChatError`, the `data-chat-*` parts vocabulary (`ChatUIMessage`,
  `isChatDataPart`) and `ChatModelOption`, for a client bundle, plus
  `sendWithoutEarlierFiles`: a `prepareSendMessagesRequest` for
  `DefaultChatTransport` that sends earlier messages' inline files without
  their bytes, which the handler restores from the stored transcript, so a
  conversation with an image in it does not re-send the image every turn. A
  message no reply answered — a turn refused before it ran — keeps its bytes,
  since the server never stored it.
  Pulls in no server code.
- `@intelligo-dev/chat/testing` — `createStubLanguageModel`, a deterministic
  model that streams with no API key.

## Licence

Apache-2.0
