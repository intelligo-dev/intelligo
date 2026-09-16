---
title: Who owns which file
description: Packages, generated source, installed pages and your agent — four kinds of file with four owners, and upgrades that never overwrite yours.
order: 4
label: Ownership
---

## Four kinds of file

| Kind | Where it comes from | Who owns it | How it updates |
| --- | --- | --- | --- |
| **Packages** | npm, `@intelligo-dev/*` | Intelligo | SemVer upgrades; never edited in place |
| **Generated source** | `intelligo create` / `intelligo add` | You | `upgrade --check` reports what changed upstream and what you edited |
| **Installed pages** | `shadcn add` from the registry | You | Re-install to take an update |
| **Your agent** | Your AI framework | You | Intelligo has no import into it |

## Generated files are hashed, not locked

`create` and `add` record every file they write, with its hash, in `intelligo.manifest.json` ([ADR-0002](https://github.com/intelligo-mn/framework/blob/main/docs/adr/0002-product-ownership.md)). `intelligo upgrade --check` compares three things — the file on disk, the hash it was written with, and the current template — and reports each as:

- `current` — matches the current template
- `outdated` — the template changed and you haven't touched the file, so regenerating is safe
- `conflict` — the template changed **and** you edited the file; your decision
- `customized` — you edited it; the template is unchanged
- `deleted` — you removed it

Nothing is overwritten by an upgrade.

## Installed pages are used verbatim

Registry blocks are yours, but the standard is to use them unmodified ([ADR-0010](https://github.com/intelligo-mn/framework/blob/main/docs/adr/0010-registry-i18n-standard.md)). What a deployment varies — navigation, banners, onboarding steps, credit bundles, the chat's agent identity and tool renderers, copy and language — flows through the config files and message files the blocks ship. See [config seams](/docs/registry/config-seams).

Editing an installed component works, but it forks you from every later improvement to that block. If a product needs something a seam doesn't offer, the better change is a new seam in the registry.

## The admin console is the exception

`@intelligo-dev/admin` is Intelligo-owned and not in the registry: what an operator can see across every tenant is not a per-product decision. `intelligo add admin-page` mounts it under `/admin`.
