# ADR-0006: Public / private / undecided package allowlists

**Status:** Accepted
**Date:** 2026-08-25
**Source:** [Architecture & Improvement Plan V2](../intelligo-architecture-improvement-plan-v2.md) §2.1, §4

## Context

The repo is a private incubation workspace headed for a public open-core split (Apache-2.0 foundation; Intelligo Cloud, enterprise operations, premium vertical kits, and domain IP stay closed). Extraction requires knowing, per package, what is destined to be public before any code moves.

## Decision

### Public (planned open-source foundation)

`core`, `database`, `auth`, `workspaces`, `entitlements`, `credits`, `billing`, `billing-stripe`, `executions`, `jobs`, `audit`, `admin`, `ui`, `next`, `mastra`, `cli`

### Private (never published)

`support` (all prompts, questions, scoring, datasets, recommendation logic, reports, conversion strategy), `acme` (the product application, today `apps/app`), `qpay`, `socialpay` (until production-ready and a commercial boundary is decided)

### Undecided — **resolved by [ADR-0008](0008-dissolving-the-undecided-packages.md)**

`chat`, `agents` and `ai` were left undecided here with resolution owed by the end of the Phase 1 inventory. That inventory ([export-classification.md](../inventory/export-classification.md)) found no export in any of the three that justifies a public package: all three dissolve into `executions`, `core`, `audit`, `jobs`, native Mastra, and private template source. They are classified `deprecated` in `config/public-packages.json` — kept in this repository, never extracted, and off-limits as a dependency of anything public.

The original wording, for the record:

- `chat` — renderer registry likely becomes a public extension point; heavy chat UI likely becomes templates/private
- `agents` — memory/RAG/tool-loop likely replace-with-native (Mastra); contracts may move to `core`/`executions`
- `ai` — cost/model accounting moves toward `executions`; runtime parts follow the `agents` decision

### Evolution map (current 9 packages → target)

| Current                    | Target                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `core`                     | `core` + `database` + parts → `audit`, `jobs`                                       |
| `auth`                     | `auth` + `workspaces` + `next`                                                      |
| `billing-core` + `billing` | `entitlements` + `credits` + `billing` + `billing-stripe`; QPay/SocialPay → private |
| `ai`                       | accounting → `executions`; runtime → native/private                                 |
| `agents`                   | runtime → native (Mastra); contracts → `core`/`executions`                          |
| `chat`                     | registry → public extension point; UI → template source (ADR-0008)                  |
| `support`                   | `product/app`                                                                    |
| `apps/app`                 | `product/app`                                                                    |
| `ui`                       | `ui`                                                                                |

### Rules

1. **No mechanical rename/split now.** Classify exports first (Phase 1); move code only behind verified contracts (Phases 2–4).
2. The current repository's Git history is **never** made public. Public extraction (Phase 7) starts a new repository with a clean initial commit after secret/history/source/license/dependency audits.
3. Nothing in a public-planned package may import from, or embed vocabulary of, private packages (enforced by the dependency-direction CI test from Phase 1).

## Consequences

- `docs/inventory/export-classification.md` (Phase 1) is the authoritative per-export ledger against these lists.
- The undecided set was resolved by ADR-0008; `config/public-packages.json` carries the machine-readable lists that the extraction script and the public-export audit both read.
- Undecided packages must not accumulate new public-facing API surface until classified.
