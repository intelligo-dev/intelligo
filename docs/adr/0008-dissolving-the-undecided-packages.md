# ADR-0008: `agents`, `ai` and `chat` dissolve

**Status:** Accepted
**Date:** 2026-08-26
**Supersedes:** the "Undecided" section of [ADR-0006](0006-package-allowlist.md)
**Evidence:** [Export Classification Ledger](../inventory/export-classification.md) §1–3, §10

## Context

ADR-0006 classified thirteen packages public and four private, and left three — `agents`, `ai`, `chat` — undecided, with "resolution owed by end of Phase 1 inventory". That inventory is done: every export reachable through the three packages' `exports` maps is classified in the ledger. The debt is this decision.

What the ledger found:

- **`agents`** — 21 rows, **zero** classified _keep_. Memory, RAG, windowing, synthesis and the built-in tools are superseded by native Mastra; the tool-middleware layer has no consumers at all (and there is no tool loop in the package — the loop is AI SDK `streamText` in the chat route); the extraction queue is generic `jobs` mechanics; `recordMemoryAudit` is an `audit` concern; the contracts are verbatim duplicates of copies in `ai` and `core`.
- **`ai`** — 14 rows, zero _keep_. The half with value is accounting: the model registry and the token→USD→MNT cost math. The other half is provider resolution, provider-native search, embeddings and image generation, all of which the chosen AI framework owns natively (ADR-0003).
- **`chat`** — 11 rows. Five of its eight subpaths (~500 symbols) have no external importer. Total external consumption is four value symbols and two types, all from the renderer registry.

The practical consequence was one edge: `billing → ai`, a public package importing an unclassified one. Extraction copied all three packages to keep that edge resolvable, which published ~500 unowned symbols to make four of them reachable.

## Decision

None of the three survives as a public package.

### `ai` → `executions` + `core` + native

The model registry (`MODEL_CONFIGS`, `ModelId`) and the cost math (`calculateCost`, `calculateChargedMnt`, `estimateWorstCaseChargedMnt`, `MODEL_OUTPUT_BUDGET`, and the margin/FX fallbacks) move to `@intelligo-dev/executions`. What a run costs is what the boundary records; it is not AI plumbing.

They land in `@intelligo-dev/executions/pricing`, a leaf module with no imports, so a client bundle can read a display name without pulling in Drizzle. `@intelligo-dev/ai` re-exports it rather than keeping a copy: two registries is precisely how a model runs on Gemini Flash and bills at Claude rates.

`ChatSDKError`/`ErrorCode` and `ChatMessage` move to `core` as framework contracts. Provider resolution, grounding, embeddings and images stay behind as replace-with-native. The `./agents` subpath reads a product-config table and is Acme-private.

### `agents` → dissolves; nothing keeps the name

Contracts (`ChatMessage`, `AgentInfo`, `BilingualText`) and the prompt sanitizer to `core`; `recordMemoryAudit` to `audit`; the SKIP-LOCKED extraction queue to `jobs`; the documents service private with the chat UI, which also removes the package's lone `agents → auth` edge. Everything else is replace-with-native or dead.

### `chat` → the registry is the public seam; the UI is template source

The renderer registry and its adapter are the chat extension point, with `AgentInfo` relocated to `core` to cut the `chat → agents` edge. The chat and artifact UI, hooks and `ai-elements` become generated template source; `elements/` is deleted as a superseded duplicate. The package name shrinks to the registry or retires.

### Until the moves land

The three directories stay in this repository, classified `deprecated` in `config/public-packages.json`. Extraction does not copy them, and no public package may declare or import one — enforced by `tests/architecture/dependency-direction.test.ts`, which reads that same file so a newly added public package is covered without anyone remembering the rule.

## Consequences

- `billing` imports `@intelligo-dev/executions/pricing`; the `billing → ai` edge is gone and the public dependency graph no longer reaches an unclassified package.
- The extracted foundation is three packages and ~500 symbols smaller, and `apps/reference` — which never imported any of the three — proves it still builds.
- The model-registry architecture rule now reads `packages/executions/src/pricing.ts`, so it keeps a subject in the extracted tree instead of silently losing one.
- `ai`, `agents` and `chat` remain fully functional for Acme and Support. Nothing was deleted; the deadline this ADR sets is on publication, not on the product.
- The remaining moves (contracts to `core`, queue to `jobs`, audit to `audit`, chat UI to templates) are ordinary Phase 3/4 work. When the last one lands, the `deprecated` list empties and the rule above becomes vacuous — delete it then rather than let it pass on nothing.
