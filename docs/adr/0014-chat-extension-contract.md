# ADR-0014: One runtime seam, consumer-owned bindings, and the tool renderer contract

**Status:** Accepted
**Date:** 2026-09-13
**Amends:** ADR-0012's "a Mastra chat transport, if one is ever wanted, is a second adapter"
**Driver:** the chat item had to reach the level a chat product is measured against — edit, regenerate, versions, attachments, citations, approvals, a canvas — while staying installable by any vertical, and the first product had lost the feature it depended on most: a tool it adds renders as its own card, inline or in a side panel.

## Context

Three things pulled in different directions.

The chat surface had to grow a great deal — the transcript, the composer,
the sidebar, a canvas beside the chat, three surfaces (page, panel,
widget), sharing, feedback — and every piece is consumer-owned registry
source (ADR-0010) that a product installs verbatim.

Products run different agent runtimes. The transport (ADR-0012) hard-wired
`streamText`; a product on Mastra or on eve forked the route again, and
each fork re-implemented auth, the gate, admission and settlement — the
things the transport exists to own. ADR-0003 forbids the obvious shortcut:
a framework-side abstraction over agent frameworks, or a package per
framework that carries their helpers.

And the extension point that mattered most was gone. The dissolved chat
package (ADR-0008) had let a product register a renderer per tool and
open a tool's output in an artifact panel; the registry item that
replaced it had a tool-renderer seam but no canvas, no approval card, no
way for a card to send the next turn. The first product's quiz stopped
being clickable and its reports stopped opening in place.

## Decision

1. **The AI SDK's `UIMessage` is the only UI contract.** Every part the
   SDK has — text, reasoning, tool and dynamic-tool with their approval
   states, source, file, step boundary, data — renders through one
   switch. Where the SDK has nothing, the transport defines
   `data-chat-*` parts (title, status, task, agent, artifact, question,
   authorization, compaction, result), typed and exported from
   `@intelligo-dev/chat/client`, which still imports nothing.

2. **`streamTurn` is the one runtime seam.** `ChatServerConfig.streamTurn`
   replaces the model call and nothing else: it receives the prepared
   turn and returns the SDK's UI message chunks plus a promise of the
   run's usage. The transport frames the message, settles the
   execution and persists exactly as it does for `streamText`. Nothing
   in the seam names a framework.

3. **Runtime bindings are consumer-owned source, never packages.** A
   Mastra agent binds through `@mastra/ai-sdk` in `lib/chat-server-config.ts`
   (a documented recipe). eve, whose protocol is its own NDJSON and not
   the SDK's, binds through the `chat-eve` registry item — `lib/chat-eve.ts`,
   an HTTP client and an event-to-chunk table the product owns and may
   extend. No `@intelligo-dev/eve`, no `@intelligo-dev/mastra/chat`: the
   framework carries no code that knows a framework's wire format
   (ADR-0003), and ADR-0011's "one package per adapter" does not apply
   because there is no adapter in a package to publish.

4. **Adding a tool is one entry in a literal the product owns.**
   `lib/chat-renderers.tsx` maps a tool name to `{ component, label,
canvas }`; `DATA_RENDERERS` does the same for `data-*` parts;
   `lib/chat-canvas-config.tsx` maps a canvas `kind` to how it is shown
   and edited. Every renderer receives the same actions — send the next
   turn, answer a client-side tool, approve or deny a gated call, open
   or close the canvas — and structural props, so a product package's
   cards do not compile against the SDK. A tool that streams a document
   uses `createArtifactWriter(turn, …)`: the canvas opens on the first
   delta and the persisted final part reopens it after a reload. No
   `register()` anywhere (ADR-0005).

5. **Versions are the client's; the row stays a list.** Regenerating or
   editing keeps the replaced tail as a version in the tab and shows a
   pager on the message that starts it. The server persists the latest
   path and trims what an edit replaced. A persisted tree would need a
   migration and a second read path for what is, today, a reader's
   convenience.

6. **Storage is a port.** Stored attachments (larger than a message
   should carry, kept after a share, extracted to text) go through
   `@intelligo-dev/core/storage`, bound from the composition root like
   the request context; the transport signs URLs for the model only and
   persists the app URL. Inline data URLs stay the default so a clean
   install needs no bucket.

## Consequences

- The `chat` item is rewritten on these contracts; `chat-panel`,
  `chat-widget`, `chat-share` and `chat-eve` join it, each requiring it.
  Nine T3 parts join the catalog. The reference app regenerates from the
  CLI as before, with `saveArtifact` streaming into the canvas so the
  stub model demonstrates the whole path with no API key.
- `ChatTurnContext` gains `write` and `updateMetadata`, so a tool bound
  through `agent.tools` can stream parts; `ChatServerConfig` gains
  `streamTurn`, `models`, `sources`, `messageMetadata`, `cors`, a
  `stored` attachment mode and the `approval` and `feedback` hooks.
  `model.resolve` is optional when `streamTurn` is set. The handler
  answers `GET` (204: nothing to resume) and `OPTIONS`.
- New seams the reference-app test tolerates: `lib/chat-models.ts`,
  `lib/chat-canvas-config.tsx`, `lib/chat-widget-config.tsx`,
  `lib/chat-eve.ts`.
- The registry takes `motion` (gated on `useReducedMotion`, enforced by
  the design-system test), Streamdown's math and mermaid plugins, and
  the canvas editors (ProseMirror, CodeMirror, react-data-grid), all
  loaded lazily. A chat route's first-load JS should be measured against
  the previous item before release.
- The first product's migration is mechanical: its quiz card sends
  through `actions.sendMessage`, its report card opens through
  `actions.openCanvas`, its tool labels become `label` keys.
