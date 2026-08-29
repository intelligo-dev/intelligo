# ADR-0010: Registry items are i18n-native and consumers install them unmodified

**Status:** Accepted
**Date:** 2026-08-27
**Amends:** the "plain-English copy, no i18n dependency" standard recorded in the page migration manifest's header
**Driver:** Acme must consume Intelligo entirely through packages and the registry — no customized forks — so that every future product starts from the same standard surface.

## Context

The first registry standard shipped items with plain-English copy and no
i18n dependency, and allowed Acme to keep customized copies of the UI.
That fork is exactly what makes a second product slow: every improvement
to a page family lands in the registry, in `apps/app`, and then a third
time — by hand — in Acme's diverged copy. The founder's direction is
the opposite: installed source is used verbatim, and everything a
deployment legitimately varies (copy, language, navigation, bundles,
steps, renderers) lives in consumer-owned configuration, not in edited
components. A bilingual product cannot do that unless the framework's
pages are translatable without touching them.

## Decision

1. **Registry items are i18n-native via next-intl.** Components read
   copy with `useTranslations`/`getTranslations` under a per-item
   namespace (the item name). No hardcoded user-facing strings.
2. **Each item ships its English messages** as a registry file targeting
   `messages/en/<item>.json`. A consumer adds locales by adding message
   files (`messages/mn/<item>.json`) — translation is configuration,
   never a component edit.
3. **Targets are locale-aware.** Page files target
   `app/[locale]/(app)/...` (and `app/[locale]/(auth)/...`,
   `app/[locale]/onboarding/...`). The scaffold and `apps/app` adopt the
   `[locale]` segment and next-intl request wiring, so Acme's existing
   structure is the standard, not a special case.
4. **Single-language deployments still work**: one locale in the config,
   the shipped English messages, nothing else to do. next-intl is part
   of the standard consumer setup the scaffold provides (it was already
   in the stack).
5. **Consumers do not modify installed components.** Deployment variance
   flows through the consumer-owned `lib/` bindings and config files the
   items already ship (strings via messages, nav, bundles, steps,
   renderers, model resolution) — extended with composition slots where
   a vertical needs to inject product UI (e.g. the chat header).

## Consequences

- All existing items are refactored once: copy → `messages/en/*.json`,
  components → translation hooks, targets → `[locale]`-prefixed.
  `apps/app` is restructured under `app/[locale]/` and gains the
  next-intl plumbing; the CLI scaffold gains the same.
- Acme installs registry items verbatim, contributes `messages/mn/*`
  translations, and deletes its superseded page/component copies —
  completing Gate F for the UI, not only the backend contracts.
- The manifest's repo-wide standard #1 is superseded by this ADR.
