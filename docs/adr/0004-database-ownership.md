# ADR-0004: One PostgreSQL database with explicit per-table ownership

**Status:** Accepted
**Date:** 2026-08-25
**Source:** [Architecture & Improvement Plan V2](../intelligo-architecture-improvement-plan-v2.md) §2.6, §5

## Context

All tables currently live in `packages/core/src/db/schema/` plus `packages/support/src/db/schema.ts`, with no ownership rules. Support-specific columns leak into shared tables (`user_quotas` has `chatMessagesUsed`/`assessmentsUsed`/`reportsUsed` beside the generic `usage` JSONB), and `referral_codes`/`referrals` sit in the AI schema file while their logic lives in billing.

## Decision

- Start with **one PostgreSQL database** (Neon + pgvector). No per-service databases in v1.
- **Every table has exactly one owner**: an Intelligo package, an optional module, or the consumer application. Intelligo packages never query consumer-owned tables directly.
- The **credit ledger is canonical**; balances are cached/derived projections.
- Migration rules: each package owns its migration files and table set; an aggregate migration planner validates ordering and collisions; every migration supports check/dry-run; core migrations never modify consumer tables; database compatibility spans at least one minor release; production deploys check for unapplied required migrations before serving incompatible code.

### Ownership map (current tables → target owner)

| Current tables                                                                                                        | Target owner                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `users, sessions, accounts, verifications`                                                                            | Intelligo `auth`                                                                |
| `organization, member, invitation`                                                                                    | Intelligo `workspaces`                                                          |
| `plans, subscriptions, billing_settings`                                                                              | Intelligo `entitlements`/`billing`                                              |
| `credit_balances, credit_purchases, trial_credits, finance_events`                                                    | Intelligo `credits` (ledger becomes canonical)                                  |
| `usage_records, monthly_usage`                                                                                        | Intelligo `executions` (evolves into `executions`/`usage_events`/`cost_events`) |
| `rate_limit_entries, user_quotas` (generic part)                                                                      | Intelligo `entitlements`                                                        |
| `user_quotas` support columns                                                                                          | **done** — migration 0038 backfilled the generic JSONB and dropped the columns  |
| `referral_codes, referrals`                                                                                           | **to-migrate** → billing schema file (Phase 1)                                  |
| `notifications, notification_history, feature_flags, jobs (future), audit (future)`                                   | Intelligo `core`/`jobs`/`audit`                                                 |
| `conversations, messages, votes, documents, suggestions, document_types, knowledge_*, image_*, agents, rag_documents` | pending Phase 1 classification (chat/agents boundary)                           |
| `competitions, competition_entries, shared_reports, user_profiles` (in `@example/product`)                       | consumer (Acme/Support, private)                                               |
| `user_facts, user_memories, user_profile_snapshots, user_memory_audit, pending_extractions`                           | pending classification (replace-with-native Mastra memory vs. private)          |

## Consequences

- Phase 1 fixes the known leaks (support columns in `user_quotas`, misplaced referral tables).
- New Intelligo tables (`credit_reservations`, `executions`, `usage_events`, `cost_events`, `audit_events`, `jobs`) are introduced by their owning packages with their own migrations (Phases 1–2).
- The `database` package (split from `core` in Phase 4) hosts the connection, migration runner, and aggregate planner.
