# ADR-0016: The transport passes a typed allowlist of generation options

**Status:** Accepted
**Date:** 2026-09-17
**Amends:** ADR-0014's "`ChatServerConfig.streamTurn` replaces the model call and nothing else"
**Driver:** setting `temperature` cost a product the whole model call — the only seam that reached it is the one that also makes the product responsible for producing correct UI message chunks and a whole-run usage promise.

## Context

ADR-0012 drew the transport's boundary around `streamText` and ADR-0014
redrew it at `streamTurn`, "the one runtime seam". Both drew it in the
same place for the same reason: the turn's envelope — auth, the plan's
rate limit, the feature gate, admission, persistence, settlement — has
to be correct exactly once, and the AI call itself is the product's
(ADR-0003).

What neither noticed is that the `streamText` call is not only a runtime.
It is also a bag of sampling settings, and those settings are the
product's by every argument the boundary makes. The call was written as
a closed literal, so `temperature`, `maxOutputTokens`, `toolChoice`,
`seed`, `maxRetries`, `headers`, `prepareStep` and `telemetry` were
unreachable. A product that wanted one number had exactly one route to
it: take `streamTurn`, replace the entire model call, and hand back a
usage promise — the thing settlement depends on. That is a large amount
of risk to accept in exchange for `temperature: 0.2`, and a product that
accepts it has re-implemented the parts the transport exists to own,
which is the failure ADR-0014's context already recorded once.

Two smaller versions of the same mistake sat beside it. The one-agent
shorthand exposed four of `ResolvedAgent`'s ten fields, so `stopWhen`,
`modelId`, `maxSteps`, `capability` and `featureKey` required writing a
whole `resolveAgent` function to reach. And `ProviderOptions` was
declared but never re-exported, so a consumer typing a `providerOptions`
object had no public name for it.

## Decision

**The transport passes a typed allowlist of settlement-neutral
generation options, and nothing else.** `ChatGenerationOptions`
(`packages/chat/src/generation.ts`) names them one by one, sourced from
the SDK's own types by indexed access so an upstream signature change is
a compile error here rather than a silently dropped field. It is reached
as `ResolvedAgent.generation`, nested rather than flattened because
`ai` has its own `reasoning` (an effort level) and
`ChatServerConfig.reasoning` already means "stream reasoning parts to
the client".

**It is an allowlist, never a denylist.** Not
`Omit<Parameters<typeof streamText>[0], forbidden>`, and not
`CallSettings` — which the SDK exports and which carries `abortSignal`,
the one field this boundary most needs to keep. A denylist over someone
else's type fails open: every option a future release adds is admitted
silently, and the guarantee has to be re-derived at every `ai` bump. An
allowlist is a proof; a denylist is a promise.

**The list grows by amendment, with a test.** Not by widening the type
to whatever the SDK accepts.

**Three mechanisms enforce it, because the type alone does not.** A
consumer who writes `generation: { … } as ChatGenerationOptions` over an
object carrying `abortSignal` punches straight through a type. So
`pickGenerationOptions` copies only the allowlisted names at runtime,
and the handler spreads its result _first_ in the `streamText` literal,
so every key the transport sets is written after it and wins. Type,
picker, key order — three independent reasons the same thing cannot
happen, and the test suite asserts the runtime two by name, one case per
forbidden key.

The settlement-critical set, recorded here so the next SDK major has a
checklist:

| Kept by the transport                          | Why                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `abortSignal`                                  | without `request.signal` an abandoned run bills in full and `onAbort` never fires                                                                       |
| `timeout`                                      | a timeout lands on the error path, which releases the hold without charging tokens the provider already produced; the route's deadline is `maxDuration` |
| `onFinish`, `onEnd`                            | where whole-run `totalUsage` is captured; replacing it ends every turn "stream ended without usage"                                                     |
| `onAbort`                                      | settles from `sumStepUsage(steps)`                                                                                                                      |
| `onError`                                      | the failure path is `run.fail()` plus localised copy                                                                                                    |
| `model`                                        | admission already priced the resolved `modelId`; another model bills one admission never saw                                                            |
| `system`, `messages`, `prompt`, `instructions` | `prepareMessages` owns what the model is shown                                                                                                          |
| `tools`, `activeTools`                         | already seams on the agent, and the same object feeds `convertToModelMessages`; a second source desynchronises the two                                  |
| `stopWhen`                                     | `stepCountIs(maxSteps)` must stay first and unremovable — an uncapped step count is an uncapped bill                                                    |
| `_internal`                                    | the SDK's own test seam, not a product knob                                                                                                             |

**The one-agent shorthand is derived, not enumerated.**
`ChatAgentConfig extends Omit<ResolvedAgent, "id" | "systemPrompt" |
"tools">`, so a field added to the agent is settable through the
shorthand without a second edit, and the default `resolveAgent` carries
it through by spreading the rest rather than naming fields. This adds no
power that `resolveAgent` did not already have; it removes an arbitrary
cliff.

## Consequences

`ChatServerConfig` gains nothing at the top level: the seam is on the
agent, where the prompt and the tools already are, so a product that
resolves several agents can sample each of them differently.

`ProviderOptions`, `ChatGenerationOptions` and `ChatAgentConfig` are
exported from the package root. `providerOptions` keeps its meaning —
the provider's own knobs, passed through untouched — and `generation` is
the SDK-level set beside it.

`generation.ts` enters the mutation-testing scope. It is pure, small,
and the one place where a wrong key list is a money bug: a mutant that
drops a name from `GENERATION_KEYS` silently narrows what a product may
set, and a mutant that removes the runtime filter opens the boundary the
type only describes. `handler.ts` stays out of that scope for now — 1070
lines of orchestration over mocked packages, streams and timing, where a
large share of mutants are equivalent.

Two findings from the same audit, recorded because they are the same
class of defect:

- **`stopWhen` on a tool-less turn is correct, not a bug.** The SDK
  consults it "when there are tool results in the last step", and a turn
  with no tools never has any. The transport drops it from the call in
  that case; the behaviour is now pinned by a test and stated in the
  field's own documentation, so a future reader does not mistake its
  absence for an oversight.
- **`activeTools` had done nothing since the AI SDK 7 upgrade.** 7.0
  dropped the `experimental_` prefix; the transport kept passing
  `experimental_activeTools`, which the compiler accepts inside a
  conditional spread and `streamText` drops into its rest parameter. An
  agent that named a subset of its tools was offered all of them. Fixed,
  and pinned by a test that records the provider-level call options —
  the stub model destructures `prompt` and nothing else, so it could
  never have caught it.

The lesson worth keeping from that last one: an SDK major whose
`type-check` and test suite both stay green has not necessarily been
migrated. Renamed options fail silently when they are passed through a
conditional spread into a function with a rest parameter.
