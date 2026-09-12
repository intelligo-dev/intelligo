# ADR-0012: The chat transport is a package; the chat UI is registry source

**Status:** Accepted
**Date:** 2026-09-12
**Amends:** "`chat` → the registry is the public seam; the UI is template source … the package name shrinks to the registry or retires" in [ADR-0008](0008-dissolving-the-undecided-packages.md)
**Driver:** the first product installed the registry's chat item and then forked its Route Handler, because the seam modelled one agent, one prompt and one tool bag.

## Context

ADR-0008 dissolved the old `@intelligo-dev/chat`: 17k lines of UI,
hooks and a copy of Vercel's AI Elements, of which four symbols had an
external importer. ADR-0009 gave conversations a public persistence
contract, and the `chat` registry item shipped the generic surface —
pages, components, actions, seams, a credit banner — as consumer-owned
source. The first product installed it: six files byte-identical.

Then it forked the route. `chatServerConfig` offered a system prompt,
a feature key, a tool bag and a title function; the product needed an
agent resolved per conversation from a table, a history pruned and
summarised before the model saw it, image attachments, reasoning
streamed to the client, a model-written title and telemetry on every
turn. None of that is product vocabulary. All of it is what any
vertical AI SaaS needs, and the 434-line Route Handler that would have
had to grow it is a file consumers install verbatim and may not edit
(ADR-0010). A file with no customisation point that nobody may edit is
a function, not template source. Separately, that route never persisted
the user's turn: without `originalMessages`, `createUIMessageStream`'s
`onFinish` sees only the reply.

## Decision

`@intelligo-dev/chat` is the AI-SDK-native chat transport, headless:
`createChatHandler(config)` returns `{ POST, DELETE }` over Web
`Request`/`Response`, and runs every turn through auth, the plan's rate
limit, the feature gate, conversation persistence
(`@intelligo-dev/core/conversations`) and the execution boundary
(`executions.begin()` decides entitlement against the model that is
about to run, and settles exactly once). No React, no `next/*`: the
request's headers reach `requireWorkspace()` through
`core/request-context`, bound once by the composition root.

The seams are config, with defaults that give a clean install a working
chat with no API keys: `resolveAgent`, `prepareMessages`, `attachments`,
`reasoning`, `deriveTitle` (sync or async), `persist`, `normalizeUsage`,
`metadata`, `onTurn`, `messages`, `authenticate`, `rateLimit`. Every
seam closes over the caller's tenancy, so the model is never told which
workspace it is in.

The registry `chat` item keeps the UI and the consumer-owned bindings.
Its Route Handler becomes two lines; its `lib/chat-server-config.ts`
binds the seams; its components read error codes and the quota-state
shape from `@intelligo-dev/chat/client`, which imports nothing. Model
resolution stays consumer-owned (ADR-0003): the provider SDK is the
application's, and the package ships only a deterministic stub
(`@intelligo-dev/chat/testing`) for a chat that has no key yet.

This is not an agent abstraction (ADR-0003). The config takes AI SDK
tools, an AI SDK model and AI SDK stop conditions, natively, and never
wraps them. A Mastra agent records executions through
`@intelligo-dev/mastra`; a Mastra chat transport, if one is ever
wanted, is a second adapter, not a generalisation of this one.

## Consequences

- The name comes off ADR-0008's dissolved list. Nothing on npm ever
  carried it; the product's copy was a private `0.0.0` workspace.
- The product can install the `chat` item verbatim, bind its agent
  table, loader, sanitiser, title model and telemetry through the
  seams, and delete its fork of the route. The remaining generic code
  in its old package — the AI Elements copy, the editor stack — is
  either installed from Vercel's own registry or retired.
- The item binds the package in the release after the package is on
  npm: shadcn's `add` installs an item's dependencies unconditionally,
  so a registry item may only declare a package that resolves.
- `apps/app`'s stub still streams with no API key, and now also
  persists the user's turn.
