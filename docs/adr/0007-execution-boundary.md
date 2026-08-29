# ADR-0007: The execution boundary is a lifecycle with ports, not a wrapper

**Status:** Accepted
**Date:** 2026-08-26
**Implements:** [ADR-0003](0003-ai-framework-boundary.md) · [Plan V2](../intelligo-architecture-improvement-plan-v2.md) §2.3, Phase 2

## Context

ADR-0003 says Intelligo records the SaaS execution boundary and nothing else, but it does not say what that costs the calling code or which package owns which half. Phase 2 had to answer three questions the plan leaves open:

1. Where does the entitlement decision live, given that `entitlements` and `credits` do not exist yet and all of it is inside `@intelligo/billing`?
2. What happens to an execution whose usage cannot be recorded?
3. How does a streaming route — which can finish through usage-resolved, client-abort, or error — avoid racing itself?

## Decision

**The boundary is `begin() → complete()/fail()`.** `@intelligo/executions` owns one table (`executions`) and one handle. It records actor, workspace, capability, entitlement outcome, status, usage, cost, and duration. It records nothing about agents, tools, messages, or streams.

**Entitlement and settlement arrive through ports.** `executions` does not depend on `billing`. It declares `checkEntitlement`, `settleUsage`, and `releaseHold`, and the consumer's composition root binds implementations (`product/app/lib/executions.ts`). Both ports are optional: unbound, executions still record the lifecycle without gating or charging, which is what a non-metered capability and the reference app want.

Rationale: binding to `billing` now would create an edge that the `entitlements`/`credits` split has to unwind later, in the package whose whole job is to be stable. The dependency-direction test enforces the absence of that edge.

**Unrecorded usage is never reported as success.** If `settleUsage` throws, `complete()` emits `execution.settlement_failed`, leaves the row `running`, and rethrows. A `running` row past the route's `maxDuration` is the operational signal that tokens were consumed and not charged; the maintenance cron reports them to Sentry. The alternative — marking it succeeded with no charge — makes a revenue leak indistinguishable from a free turn.

**Terminal transitions are idempotent.** `complete()` and `fail()` flip the row with a conditional `UPDATE ... WHERE status = 'running'` and skip their side effects when another path already won. A route may wire `onFinish`, `onError`, and an abort handler without coordinating between them.

**The credit hold is the reservation from Phase 1.** `executions.requestId` is the correlation key shared with `credit_reservations` and `usage_records`. Admission reserves the worst-case estimate; settlement releases it by charging; `fail()` releases it without charging; an abandoned hold expires after a TTL longer than `maxDuration` and is dropped rather than charged.

**The AI-framework bridge is optional and structural.** `@intelligo/mastra` depends on `executions` and nothing else; `@mastra/core` is an optional peer dependency it never imports. The agent arrives as an argument typed by the narrowest structural shape that makes the call work, so the bridge installs without Mastra and fits any comparable call. That is ADR-0003's "thin and removable" satisfied by construction rather than by discipline.

## Consequences

- Capability strings (`chat.message`, `support.recommendation`) are the product's vocabulary and opaque to Intelligo. They group executions for the usage UI and admin console and are what a future per-capability policy keys on.
- Admission moved out of the request middleware into `begin()`, so it happens once, after the model is resolved (the hold matches what will actually run) and against a recorded row.
- `usage_records` gains `execution_id` instead of a duplicate `usage_events` table — it already is the per-request usage detail. The rename to the target names happens with the Phase 4 package split.
- The Phase 6 test "a second AI framework can record executions without a universal agent abstraction" is now a matter of writing a second bridge against the same ports.
