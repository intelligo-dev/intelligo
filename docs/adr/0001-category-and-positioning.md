# ADR-0001: Intelligo is an application framework and operational platform, not a starter kit

**Status:** Accepted
**Date:** 2026-08-25
**Source:** [Architecture & Improvement Plan V2](../intelligo-architecture-improvement-plan-v2.md) §1, §1.1

## Context

Intelligo's previous positioning ("clone this repo, everything is a package, Intelligo-owned AI runtime") reads as a starter kit / boilerplate. Starter kits are cloned once, diverge immediately, and offer no upgrade path. That category is crowded, low-value, and does not match the work already invested in auth, multi-tenancy, billing, credits, and usage accounting.

## Decision

Intelligo is an **open-source application framework and operational platform for vertical AI SaaS products** — a level above a starter kit:

- Applications keep Intelligo as a **long-lived, versioned runtime dependency**.
- Intelligo continuously supplies contracts, database migrations, compatibility checks, an admin console, `doctor` diagnostics, and safe codemods across releases.
- `create-intelligo-app` and generated pages are **onboarding mechanisms**, not the product boundary. The enduring product is the framework/runtime relationship.
- The current repository is a **private incubation workspace**. Its Git history is never published; the future public repository starts from a clean initial commit (see ADR-0006).

## Consequences

- Package APIs are contracts: SemVer discipline, deprecation policy, and database compatibility windows become mandatory (enforced progressively via CI gates).
- Upgrade tooling (`doctor`, `upgrade --check`, migration checks, codemods) is core scope, not nice-to-have.
- Documentation and README must never describe Intelligo as a boilerplate/starter, and "clone and edit the framework" workflows are not supported paths.
- Competing as another static "clone this AI SaaS starter" repository is an explicit non-goal.
