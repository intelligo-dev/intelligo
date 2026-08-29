# ADR-0003: AI frameworks stay native; Intelligo records only the SaaS execution boundary

**Status:** Accepted
**Date:** 2026-08-25
**Source:** [Architecture & Improvement Plan V2](../intelligo-architecture-improvement-plan-v2.md) §2.3

## Context

`@intelligo/ai` and `@intelligo/agents` currently own model registry, tool loop, memory, RAG, context injection, and provider behavior — an Intelligo-owned AI runtime. Competing with Mastra, Vercel AI SDK, and Eve on agent abstractions is a losing position and couples every product to our runtime's limitations.

## Decision

Intelligo will **not** build a universal `IntelligoAgent`, `IntelligoTool`, `IntelligoWorkflow`, or `IntelligoMemory` abstraction.

- **Mastra is the initial first-class integration** (Acme is the proof product). Mastra agents, tools, workflows, memory, results, streaming, and types remain fully native.
- Other frameworks (AI SDK, Eve) may get thin optional bridges later, only after real demand, and only against the execution boundary.
- Intelligo records only the narrow SaaS execution boundary: **actor, workspace, capability, entitlement, status, usage, cost, credits, and audit metadata**:

```ts
const run = await executions.begin({
  workspaceId,
  userId,
  capability: "support.recommendation",
});
try {
  const result = await careerAgent.generate(messages); // native Mastra
  await run.complete({ usage: result.usage, model: result.model });
  return result;
} catch (error) {
  await run.fail({ error });
  throw error;
}
```

## Consequences

- The AI-runtime portions of `@intelligo/ai` (model registry, tool-loop plumbing) and `@intelligo/agents` (memory, RAG, tool middleware, context/windowing) were **legacy pending classification** here. The Phase 1 inventory classified them and [ADR-0008](0008-dissolving-the-undecided-packages.md) dissolved both packages: nothing in either is published. No new features land on them.
- Cost/usage calculation (`calculateCost`, `calculateChargedMnt`) survives — it belongs to the execution/accounting boundary, not the runtime. It now lives there: `@intelligo/executions/pricing` (ADR-0008).
- The current AI path keeps working behind compatibility adapters until the Mastra migration completes (Phases 2–3).
- The Mastra integration package must remain thin and removable; a second framework recording executions without new abstractions is the validation test (Phase 6).
