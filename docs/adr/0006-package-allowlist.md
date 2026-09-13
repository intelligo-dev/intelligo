# ADR-0006: Public / private / undecided package allowlists

**Status:** Accepted; the public allowlist and the evolution map are superseded by [ADR-0011](0011-package-topology.md). The rules below stand.
**Date:** 2026-08-25

## Context

The framework ships as Apache-2.0 packages; products built on it live in their own repositories. Extraction requires knowing, per package, what is destined to be public before any code moves.

## Decision

### Public (planned open-source foundation)

`core`, `database`, `auth`, `workspaces`, `entitlements`, `credits`, `billing`, `billing-stripe`, `executions`, `jobs`, `audit`, `admin`, `ui`, `next`, `mastra`, `cli`

### Private (never published)

Everything product-specific: the product's domain package (prompts, questions, scoring, datasets, recommendation logic, reports), the product application (today `apps/app`), and product-specific payment adapters (until production-ready). These live in the product's own repository.

### Undecided — **resolved by [ADR-0008](0008-dissolving-the-undecided-packages.md)**

`chat`, `agents` and `ai` were left undecided here with resolution owed by the end of the Phase 1 inventory. That inventory found no export in any of the three that justifies a public package: all three dissolve into `executions`, `core`, `audit`, `jobs`, native Mastra, and private template source. They are classified `deprecated` — kept in this repository, never extracted, and off-limits as a dependency of anything public.

The original wording, for the record:

- `chat` — renderer registry likely becomes a public extension point; heavy chat UI likely becomes templates/private
- `agents` — memory/RAG/tool-loop likely replace-with-native (Mastra); contracts may move to `core`/`executions`
- `ai` — cost/model accounting moves toward `executions`; runtime parts follow the `agents` decision

### Evolution map (current 9 packages → target)

| Current                    | Target                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `core`                     | `core` + `database` + parts → `audit`, `jobs`                                               |
| `auth`                     | `auth` + `workspaces` + `next`                                                              |
| `billing-core` + `billing` | `entitlements` + `credits` + `billing` + `billing-stripe`; other payment adapters → product |
| `ai`                       | accounting → `executions`; runtime → native/private                                         |
| `agents`                   | runtime → native (Mastra); contracts → `core`/`executions`                                  |
| `chat`                     | registry → public extension point; UI → template source (ADR-0008)                          |
| `ui`                       | `ui`                                                                                        |

### Rules

1. **No mechanical rename/split now.** Classify exports first (Phase 1); move code only behind verified contracts (Phases 2–4).
2. The original private repository's Git history is **never** made public. Public extraction (Phase 7) starts a new repository with a clean initial commit after secret/history/source/license/dependency audits.
3. Nothing in a public-planned package may import from, or embed vocabulary of, private packages (enforced by the dependency-direction CI test from Phase 1).

## Consequences

- The Phase 1 export-classification inventory is the authoritative per-export ledger against these lists.
- The undecided set was resolved by ADR-0008; the publishable set is enforced by `tests/architecture/publishability.test.ts`.
- Undecided packages must not accumulate new public-facing API surface until classified.
