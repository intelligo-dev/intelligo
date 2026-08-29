# ADR-0009: Conversation and document persistence become public core capabilities

**Status:** Accepted
**Date:** 2026-08-26
**Amends:** the "documents service private with the chat UI" destination in [ADR-0008](0008-dissolving-the-undecided-packages.md)
**Driver:** [Page and Registry Migration Plan](../intelligo-page-registry-migration-plan.md) §3, Phase 5

## Context

ADR-0008 routed `@intelligo-dev/agents`' documents service private, colocated with
the chat UI, because at classification time its only consumer was Acme. The
page/registry migration plan then made a stronger claim about ownership: the
`chat` and `artifacts` page families install as consumer-owned source, and the
backend the installed source calls — "conversation, message, memory and
artifact persistence contracts" — is Intelligo's side of the boundary. A
registry item may not import a private or deprecated package (the architecture
suite enforces both), so a private documents service would leave `artifacts`
with no backend a clean application can reach. The tables were never in
question: `conversations`, `messages`, `documents` and `document_types` have
lived in `@intelligo-dev/core`'s schema all along; only the service layer sat in a
dissolving package.

## Decision

The persistence contracts for conversations, messages and documents are public
capabilities in `@intelligo-dev/core`, beside notifications: a `conversations`
module (conversation/message lifecycle: create, list, read, rename, delete,
message append/window reads, vote state) and a `documents` module (document
lifecycle: save, list, read, delete versions, ownership and workspace/user
access checks). Both enforce tenant scoping internally, take resolved
actor/workspace ids, and know nothing about agents, tools, streaming or
rendering — those remain the product's native AI code and the execution
boundary's records (ADR-0003, ADR-0007).

ADR-0008 stands for everything else it decided. What changes is one
destination: the documents service (and the conversation queries that were
headed to the same private corner) land in `core` instead of private chat
territory. `@intelligo-dev/agents` still dissolves; Acme and the registry items
converge on the same core modules at their respective cutovers.

## Consequences

- The `artifacts` and `chat` registry items get a backend a clean application
  can import, satisfying the migration plan's Phase 5 exit criterion.
- `@intelligo-dev/core` grows two modules but no new dependencies; the schema it
  already owned gains its service layer.
- Acme's `actions/document.ts` and conversation actions become thin
  transports over the core modules at cutover, retiring their
  `@intelligo-dev/agents` imports — one fewer edge into a dissolving package.
