---
title: Models and pricing
description: Run chat on a real provider model, register what it costs, offer a plan-gated model picker, and see how each turn's charge is computed.
order: 2
---

A fresh install streams from a stub model and already bills it under a real, registered id, so admission, settlement and the usage page work before you have a provider key. At the end of this page chat runs on your provider, every model you offer has a price, and the composer has a picker.

## Swap the stub for a provider

Install the AI SDK provider you use. The framework ships none of them.

```bash
pnpm add @ai-sdk/anthropic
```

Set its key in `.env`. The scaffold's `.env.example` lists the three names the AI SDK providers read: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`.

Then replace the body of `getChatModel` in `lib/chat-model.ts` and point `CHAT_MODEL_ID` at the matching registered id:

```ts title="lib/chat-model.ts"
import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";

/** Must be a registered model id in `@intelligo-dev/executions/pricing`. */
export const CHAT_MODEL_ID = "anthropic/claude-sonnet-4-6";

export function getChatModel(modelId: string): LanguageModel {
  void modelId;
  return anthropic("claude-sonnet-4-6-20260214");
}
```

Two strings are in play. `CHAT_MODEL_ID` is the registry key the turn is admitted and billed under. The string you pass to the provider is the provider's own id, which is often dated; the registry keeps it in the entry's `model` field. `lib/chat-server-config.ts` already binds both as `model: { defaultId: CHAT_MODEL_ID, resolve: getChatModel }`, and `lib/chat-quota.ts` prices the composer's credit banner against the model the reader picked, falling back to `CHAT_MODEL_ID`.

Prompts, tools and other runtimes are covered in [Bring your agent](/docs/guides/bring-your-agent).

## Register every model you run

A model id is a key into a price registry. Nothing registers itself: your [composition root](/docs/concepts/composition-root) does it. The scaffold's `composeIntelligo()` in `lib/intelligo.ts` calls `registerModels(DEFAULT_MODELS)`. The shipped catalogue holds six entries: `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `openai/gpt-5-mini`, `openai/gpt-5.4-mini`, `openai/o4-mini` and `anthropic/claude-sonnet-4-6`. Its prices are the providers' published USD rates and go stale. Register your own entry for a contracted rate or a model the catalogue does not know; `registerModel` replaces an entry with the same `id`.

```ts title="lib/intelligo.ts"
import {
  DEFAULT_MODELS,
  registerModel,
  registerModels,
} from "@intelligo-dev/executions";

registerModels(DEFAULT_MODELS);
// Example rates. Use the ones your provider quotes you.
registerModel({
  id: "mistral/mistral-small",
  provider: "mistral",
  model: "mistral-small-latest",
  displayName: "Mistral Small",
  costPerMInputTokens: 0.1,
  costPerMOutputTokens: 0.3,
  maxOutputTokens: 4_000,
  capabilities: {
    thinking: false,
    toolCall: true,
    vision: false,
    webSearch: false,
    codeExec: false,
  },
});
```

Every field of `ModelPricing` is required:

| Field                  | Meaning                                                                  |
| ---------------------- | ------------------------------------------------------------------------ |
| `id`                   | Provider-prefixed registry key, such as `google/gemini-2.5-flash`        |
| `provider`             | Provider name                                                            |
| `model`                | The id the provider's SDK expects                                        |
| `displayName`          | Human-readable name                                                      |
| `costPerMInputTokens`  | USD per million input tokens, as the provider quotes it                  |
| `costPerMOutputTokens` | USD per million output tokens                                            |
| `maxOutputTokens`      | Output ceiling used for the worst-case estimate at admission             |
| `capabilities`         | Five booleans: `thinking`, `toolCall`, `vision`, `webSearch`, `codeExec` |

Prices are plain USD numbers here and nowhere else; everything computed from them is micros with a currency. `isModelRegistered(id)` answers whether an id has a price, `getModelPricing(id)` returns the entry, and `listModels()` returns all of them. They are also exported from `@intelligo-dev/executions/pricing`, a dependency-free subpath a client bundle can import.

## What an unregistered id does

Pricing never guesses. `providerCost`, `chargeFor` and `estimateWorstCaseCharge` throw `UnknownModelError`, whose message names the id and lists what is registered.

In chat you see a refusal, not a crash. Admission catches the error and refuses the turn with code `unknown_model`. `createChatHandler` answers HTTP 503 with `code: "MODEL_UNAVAILABLE"` and `reasonCode: "unknown_model"` before any provider tokens are spent. The reader sees that the assistant is temporarily unavailable, not an upgrade prompt, and the id is in your error log.

`pnpm exec intelligo doctor` reports an error named `models` when `lib/intelligo.ts` contains no `registerModels()` or `registerModel()` call. It does not check individual ids. To fail at startup instead of on the first turn, assert the ids you ship after registering:

```ts title="lib/intelligo.ts"
for (const id of [CHAT_MODEL_ID, ...CHAT_MODELS.map((m) => m.id)]) {
  if (!isModelRegistered(id)) throw new Error(`No price for ${id}`);
}
```

## Offer a model picker

`lib/chat-models.ts` exports `CHAT_MODELS`, empty by default: no picker, every turn runs on `CHAT_MODEL_ID`. List two or more options and the composer shows a picker. An option is:

<!-- snippet: packages/chat/src/client.ts#ChatModelOption -->

```ts
export type ChatModelOption = {
  id: string;
  label: string;
  description?: string;
  /** Plan feature the workspace needs for this model; unset means every plan. */
  featureKey?: string;
};
```

```ts title="lib/chat-models.ts"
export const CHAT_MODELS: ChatModelOption[] = [
  { id: "google/gemini-2.5-flash", label: "Fast" },
  {
    id: "anthropic/claude-sonnet-4-6",
    label: "Smart",
    featureKey: "pro-models",
  },
];
```

Grant the feature in `lib/plans.ts` by adding `"pro-models": ["pro"]` to `FEATURES`. A feature no plan lists is denied to everyone.

`getChatModelOptions(workspaceId)` filters the list by the workspace's plan, so a Free workspace never sees "Smart". The first option is preselected, and the choice is sent as `modelId` with each turn. The server checks again: a `modelId` that is not in `CHAT_MODELS`, or whose `featureKey` the plan lacks, is refused with HTTP 403, `code: "FEATURE_GATED"` and `reasonCode: "model_not_allowed"`. A model set by `resolveAgent` wins over the request's choice.

`getChatModel` now receives ids from more than one provider, so switch on the id:

```ts title="lib/chat-model.ts"
export function getChatModel(modelId: string): LanguageModel {
  const entry = getModelPricing(modelId);
  if (entry?.provider === "anthropic") return anthropic(entry.model);
  return google(entry?.model ?? "gemini-2.5-flash");
}
```

## How a turn is charged

Every turn is priced twice, with the `BillingRate` your composition root declared through `ensureBillingSettingsRow`: `currency`, `usdRateMicros` (what one USD costs in that currency) and `marginBp`, where `DEFAULT_MARGIN_BP` is `40_000`, meaning 4× provider cost.

1. **Admission.** `estimateWorstCaseCharge(modelId, rate)` prices a 16,000-token input budget plus the entry's `maxOutputTokens`, and that amount is held. If the workspace cannot cover it, the turn is refused with `insufficient_credits`.
2. **Settlement.** `chargeFor(modelId, inputTokens, outputTokens, rate)` takes the run's actual usage and returns `providerCost` in USD and `charged` in your currency: provider cost × margin, converted at your rate, each step rounded up to a whole micro.

On `anthropic/claude-sonnet-4-6`, a turn of 1,200 input and 400 output tokens costs 1,200 × 3 + 400 × 15 = 9,600 micros (USD 0.0096) and is charged 38,400 micros at 4×. Its worst case is 16,000 × 3 + 8,000 × 15 = 168,000 micros, held as USD 0.672. That is more than the scaffold's Free plan allowance of USD 0.50, so gate expensive models to a plan that can fund them, or register them with a lower `maxOutputTokens`. The registry value also caps what the model may write in one step, so the hold is a real ceiling; `agent.generation.maxOutputTokens` in `lib/chat-server-config.ts` overrides it.

## Next

- [Credits and money](/docs/concepts/credits-and-money) — micros, currencies, allowances and top-ups
- [The execution boundary](/docs/concepts/execution-boundary) — admit, settle, fail, reconcile
- [Plans and features](/docs/guides/plans-and-features) — the feature keys that gate a model
