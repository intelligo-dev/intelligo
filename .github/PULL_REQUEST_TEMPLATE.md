## Why

<!-- What this changes and why. Link the issue it closes. -->

## Checklist

- [ ] One concern, with a conventional commit subject
- [ ] A test that fails without the change (a case in `tests/architecture/` for a boundary change)
- [ ] `pnpm type-check && pnpm lint && pnpm test` pass locally
- [ ] A `CHANGELOG.md` entry under `[Unreleased]` for anything a consumer notices
- [ ] No product vocabulary in a package; installed registry components are not edited (a seam in `packages/registry/base/` instead)
- [ ] An ADR is added or updated if this changes a decision in `docs/adr/`
