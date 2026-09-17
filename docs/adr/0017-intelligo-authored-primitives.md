# ADR-0017: Intelligo authors the interactive primitives and owns the theme's values

**Status:** Accepted
**Date:** 2026-09-17
**Amends:** ADR-0013 §3 (the token values) and §6 (T1 is shadcn's alone)
**Driver:** the AI parts (T3) press, glide and settle with springs; the buttons, menus and dialogs around them are stock base-nova and do not, so one page moves in two languages.

## Context

ADR-0013 took shadcn's neutral values and its primitives as they ship.
The chat's T3 parts were since rebuilt with a deliberate motion vocabulary
— shared easings and springs in `ai-motion`, reduced motion honoured — and a
quieter surface: an off-white page, a slightly darker card, hairline borders.
Next to them the stock primitives read as a different product: a pure-white
page, hard grey borders, buttons and popups that snap.

## Decision

1. **T1 may be an Intelligo item.** Where a primitive carries interaction —
   button, checkbox, radio group, switch, input, textarea, tooltip, popover,
   dropdown menu, select, dialog, alert dialog, sheet, tabs, collapsible,
   progress, spinner — Intelligo ships it as a `registry:ui` item under
   `packages/registry/base/ui/<name>/`, installed to the same
   `components/ui/<name>.tsx` path, and every item names it
   `@intelligo/<name>`. The rest of T1 and T2 stays shadcn's, named bare.
2. **The API is shadcn's.** An Intelligo primitive keeps base-nova's export
   surface — component names, props, variants, `render` — and Base UI's
   behaviour underneath: focus, keyboard, dismissal and ARIA are Base UI's,
   never re-implemented. Only look and motion change, so a consumer's code
   and every block compile unchanged.
3. **Motion is shared.** The easings and springs live in one
   `motion-presets` item that the primitives and `ai-motion` both use; a
   CSS transition uses the `--ease-*` tokens, which carry the same curves.
   Every motion component honours `prefers-reduced-motion`.
4. **The theme's values are Intelligo's.** The contract's names do not
   change (ADR-0013 §3); their values do: an off-white page with a darker
   card, translucent hairline borders and inputs, a near-black primary, a
   larger radius, and a dark mode on warm near-black surfaces. Status and
   focus tokens are re-measured against the new surfaces and still meet AA.
   Brand values — gradients, glass, accent hues — stay out of the base; a
   surface that wants them (the site) defines them in its own layer.

## Consequences

- Every block's `registryDependencies` moves from `button` to
  `@intelligo/button` (and so on); the registry test already requires the
  namespaced name once the item exists.
- The primitives are subject to the design-system source rules — semantic
  tokens, the arbitrary-value allow-list, `useReducedMotion` beside every
  `motion/react` import — which stock base-nova files were never checked
  against.
- An upstream base-nova fix no longer reaches these files by reinstall; the
  items track upstream by hand, as T3 does.
- `motion` becomes a dependency of any app that installs a block.
