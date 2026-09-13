# ADR-0013: One design system — shadcn base-nova, an additive token contract, and a tiered catalog

**Status:** Accepted
**Date:** 2026-09-13
**Amends:** "Radix" in the tech stack; the hand-copied token block in `apps/app/app/globals.css`; `@intelligo-dev/ui`'s role in [ADR-0011](0011-package-topology.md)
**Driver:** the chat surface alone is about to add ten to twenty primitives, and the foundation they would sit on was three shadcn styles, four token files in three colour formats and two dark-mode mechanisms.

## Context

Nothing decided how an Intelligo page looks, so every surface decided
for itself. `apps/app` ran shadcn `new-york`; the site ran `radix-nova`
over its own hex palette and `data-theme` dark mode, so the previews it
published did not match the app; `@intelligo-dev/ui` kept a third
button. The app's `globals.css` was a hand copy of `packages/ui`'s
tokens, including self-referencing `@theme` entries that generated no
utility, a sidebar block defined twice with different dark values,
`--shadow-*` overriding Tailwind's scale and a product's `--weather-*`
palette. Registry items filled the gaps by hand: 48 palette colour
classes where a status token belonged, six page-heading styles, four
empty states, eighteen hand-written field errors, twelve `Loader2`
spinners, and a chat UI built from `<details>`, `<pre>` and
`scrollIntoView`. A product that installs those items verbatim
(ADR-0010) cannot theme a colour that is not a token.

shadcn itself changed underneath: a style is now `{base}-{style}`
(Radix, Base UI or React Aria × Vega, Nova, Maia, Lyra, Mira, Luma,
Sera, Rhea), Base UI is the default base, presets and `registry:base`
items carry a whole configuration, and Field, Empty, Item, InputGroup,
ButtonGroup, Spinner, Kbd and a chat set (MessageScroller, Message,
Bubble, Attachment, Marker) are official components.

## Decision

1. **Base UI, style Nova.** Every Intelligo surface — registry items,
   `apps/app`, the CLI scaffold, the site — uses `components.json`
   `style: "base-nova"`, `baseColor: neutral`, `iconLibrary: lucide`,
   Geist. Primitives compose with Base UI's `render` prop. `asChild`,
   `radix-ui`, `@radix-ui/*` and `--radix-*` variables do not appear in
   source this repository ships. Registry items are authored for
   base-nova only: `shadcn add` converts `asChild` to `render` into a
   base project, but nothing converts the other way, so a block written
   for Base UI is base-only by construction, and we say so rather than
   serve half-working variants. Items keep importing `cn` from
   `@/lib/utils`, which base-nova's scaffold re-exports from the `cn`
   package.

2. **The preset is a registry item.** `intelligo.dev/r/intelligo.json`
   is a `registry:base` item modelled on shadcn's own base-nova init
   payload: its `config`, its dependencies, `font-geist`, the neutral
   theme and the Intelligo additions below. `intelligo create`
   initialises from it; an existing app applies it. Blocks depend on
   the token contract, never on the look: a consumer who re-values the
   tokens re-themes every installed page without editing one.

3. **The token contract is shadcn's, plus additive tokens only.**
   The official set in OKLCH — surface, intent, `border`/`input`/`ring`,
   `chart-1..5`, `sidebar-*`, `--radius` — in `:root` and `.dark`,
   mapped with `@theme inline`. Intelligo adds, never renames:
   - status pairs `--success`, `--warning`, `--info`, each with
     `-foreground`, and `--destructive-foreground`. A status token is
     both a text colour on the page surface and a fill under its
     foreground, so both pairs meet AA; tints are opacity on the token
     (`bg-success/10`), not extra tokens;
   - layers `--z-sticky`, `--z-dropdown`, `--z-overlay`, `--z-modal`,
     `--z-popover`, `--z-toast`, used through `z-sticky`… utilities
     (Tailwind has no z-index theme namespace);
   - motion `--duration-fast`, `--duration-normal`, `--duration-slow`
     through `duration-fast`… utilities, and `--ease-standard`,
     `--ease-emphasized`, `--ease-exit` in Tailwind's `--ease-*`
     namespace; `prefers-reduced-motion: reduce` collapses them.

   Stock neutral values that miss WCAG AA are raised: `--ring` and `--sidebar-ring` in light mode (2.6:1 against the background, below the 3:1 a focus indicator needs), `--muted-foreground` in light mode (4.3:1 on `--muted`), and light `--destructive` (4.0:1 as text on its own 10% tint — the pattern base-nova's destructive badge, alert and button all use). Status tokens meet the same bar: text on the page, on a card and on its own tint, and their foreground on the fill. Everything else is shadcn's value. There are
   no spacing, font-size, shadow or brand tokens: Tailwind's scales and
   the style own those, and a product's palette is its own theme.

4. **Dark mode is the `.dark` class** on `<html>` (`next-themes` in the
   apps, an inline script on the static site), with
   `@custom-variant dark (&:is(.dark *))`.

5. **Accessibility is WCAG 2.2 AA.** Text pairs ≥ 4.5:1, UI boundaries
   and focus indicators ≥ 3:1, a visible focus, targets ≥ 24px,
   `aria-label` on icon-only controls, `role="status"` on live regions.
   A test computes the contrast of every token pair in both modes.

6. **The catalog has four tiers.** A page uses the lowest tier that has
   what it needs.
   - **T1 — shadcn primitives**, named bare in `registryDependencies`.
   - **T2 — shadcn composites**: Field, Empty, Item, InputGroup,
     ButtonGroup, Spinner, Kbd, and the chat set (MessageScroller,
     Message, Bubble, Attachment, Marker). The conversation surface —
     scrolling, message layout, bubbles, attachments — is T2.
   - **T3 — AI parts**: Reasoning, Tool, CodeBlock, Sources, Suggestion,
     PromptInput, Artifact. Vercel's AI Elements is the reference, but
     it is Radix-only today (`asChild`, a Radix state hook, HoverCard
     props Base UI lacks). These ship as Intelligo `registry:ui` items
     ported to base-nova, with the Apache-2.0 attribution and the
     upstream version in each file's header, and move to
     `@ai-elements/*` by name once upstream supports Base UI.
   - **T4 — Intelligo patterns**, only for a pattern at least three items
     repeat that no tier above covers: `page-header`, `stat-card`,
     `status-badge`, `copy-button`. An empty state is Empty, a field
     error is FieldError, a pending button is Spinner — not new
     components.

   T3 and T4 live in `packages/registry/base/ui/<name>/`, install to
   `components/ui/<name>.tsx`, and follow the same rules as T1.

7. **Authoring rules for registry source.** Colour comes from semantic
   tokens only — no palette classes, no literal colours in class names.
   Arbitrary values come from a reviewed allow-list. Icons size with
   `size-*`. Forms are Field; empty states are Empty; pending actions
   are Spinner with `disabled` and `aria-busy`; route `loading.tsx` is
   Skeleton. A page title is PageHeader. Toasts go through `sonner`.
   Status is shown with a status token, Badge or Alert.

8. **One canonical copy of each thing.** `packages/registry` holds the
   `intelligo` base, T3, T4 and the blocks. `apps/app/components/ui` is
   the installed result of T1–T4, and the site's catalog and previews
   are synced from those two places — never from a copy of their own.

9. **`@intelligo-dev/ui` is retired.** Nothing in the registry or the
   reference app imports it, the admin console lists it without using
   it, and a runtime token import from it is exactly what ADR-0010's
   consumer-owned source rules out. It is deprecated on npm and removed
   from the workspace.

## Consequences

- The migration is breaking for installed pages: every item moves from
  `asChild` to `render`, and a consumer re-installs primitives and items
  on base-nova. Nova is visually denser than new-york (an `h-8` default
  button, a tinted destructive variant).
- `tests/architecture/design-system.test.ts` enforces the rules above
  on registry source, the reference app and the site: no palette
  classes, no unlisted arbitrary values, no Radix, the token contract
  present and identical in the `intelligo` item, the scaffold and the
  app, and AA contrast for every pair. It starts from a recorded
  baseline of today's violations that may only shrink.
- The CLI's install smoke installs every item into a scaffold created
  from the `intelligo` base and type-checks it.
- Porting AI Elements is a maintenance cost Intelligo carries until
  upstream ships Base UI support; the ports stay close to upstream so
  the switch back is a rename.
- The chat item pins `ai@6` and `@ai-sdk/react@3`; moving to AI SDK 7
  is its own decision.
