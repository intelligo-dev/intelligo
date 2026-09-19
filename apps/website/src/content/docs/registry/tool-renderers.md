---
title: Tool renderers
description: A tool your agent calls renders as a row in the activity stream, or as its own card — inline or in the side canvas — through one object in source you own.
order: 3
---

The chat speaks the AI SDK's `UIMessage` — text, reasoning, tool calls with their approval states, sources, files, data parts — and renders all of it through one switch. What a product adds is an entry in `lib/chat-renderers.tsx`.

## Rows and cards

A tool with no entry renders as a **row** in the agent's activity stream ("Searched the web ▸"). An entry turns it into a **card**, or refines the row:

```tsx title="lib/chat-renderers.tsx"
export const TOOL_RENDERERS: Record<string, ToolRenderer | ComponentType<ToolRendererProps>> = {
  saveArtifact: { component: ArtifactLinkCard, canvas: { kind: "text" } },
  getWeather: WeatherCard,
  lookupInvoice: { label: "invoices.lookingUp" },
  generateReport: { component: ReportCard, label: "reports.generating", canvas: { kind: "text" } },
};
```

| Field       | What it does                                                                                                                |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| `component` | Draws the call as its own card, in every state: input streaming → output available, and the approval states of a gated tool |
| `label`     | A message key naming the call in its row and in the status line, instead of the raw tool name                               |
| `activity`  | Builds the row when the default isn't enough                                                                                |
| `sources`   | Reads citations from the tool's output; the default reads `output.sources`                                                  |
| `canvas`    | The output also lives in the side panel; `lib/chat-canvas-config.tsx` decides how its `kind` renders                        |

There is no `register()` call: the object is plain source, populated at build time.

## Cards can act

A card receives `actions`: send the next user turn (a quiz option, a suggested reply), answer a tool that runs client-side, approve or deny a gated call, open or close the canvas.

## Data parts

`DATA_RENDERERS` is the same seam for `data-*` parts — what a Mastra workflow, another runtime or your own `turn.write()` emits. The framework's `data-chat-*` parts (status, plan, artifact, question and others) already have renderers.

## Streaming a document

A server tool can stream a document straight into the canvas:

```ts
const writer = createArtifactWriter(turn, { kind: "text", title: "Quarterly report" });
writer.append(delta);
await writer.finish({ documentId });
```

The canvas opens by itself; a card's Open reopens it.
