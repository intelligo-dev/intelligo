# ADR-0018: Primitive motion is motion/react, on the shared vocabulary

**Status:** Accepted
**Date:** 2026-09-18
**Amends:** ADR-0017 §3 (primitive motion is CSS)
**Driver:** the primitives took the reference look but not its motion: popups faded on a CSS curve and vanished without an exit worth the name, the press was a CSS scale, and the page still moved in two languages — springs in the AI parts, tweens everywhere else.

## Context

ADR-0017 kept primitive motion in CSS so a button stays a server-renderable
component, `render` swaps its element without losing the press, and no
primitive adds a runtime dependency. The cost showed once the primitives
sat beside the T3 parts: a CSS transition cannot spring, cannot follow a
measured position with physics, and an exit is only as long as Base UI's
`data-ending-style` window. `motion` is already a dependency of every
chat surface, so the dependency argument carried little weight.

Base UI documents how motion drives its popups: the root is controlled so
`AnimatePresence` sees the open state, the portal is `keepMounted`, the
popup renders a `motion.div`, and opacity always animates because Base UI
reads `getAnimations()` to know when the exit is over.

## Decision

1. **Interactive primitives animate with `motion/react`.** Popover, dropdown
   menu (and its submenus), select, tooltip, dialog, alert dialog and sheet
   open and close with springs; the tabs indicator glides on a spring from
   Base UI's measured position; the switch thumb, the checkbox tick and the
   radio dot move on springs or draw in. The shadcn API is unchanged: every
   root keeps `open`, `defaultOpen` and `onOpenChange` (a cancelled change is
   respected) and is made controlled internally by `useOpenState`.
2. **One vocabulary.** The easings, springs and presets live in the
   `ai-motion` item (`SPRING_POPUP`, `popupMotion`, `backdropMotion`,
   `useOpenState`, `Press`, `listStagger`/`listItem`), which every tier now
   imports. Its curves are the ones the `--ease-*` tokens carry.
3. **The button stays importable from the server.** `button.tsx` carries no
   `"use client"`; it renders `Press` (a client component in `ai-motion`)
   through Base UI's `render`, so `buttonVariants` still works in server
   components and in the site's static pages. A button given its own
   `render` — a link, a trigger's element — keeps the CSS press.
4. **Reduced motion still wins.** Every file that imports `motion/react`
   reads `useReducedMotion` (the design-system test enforces it) and
   collapses to an instant change.
5. **CSS stays where Base UI measures.** Collapsible (its panel height) and
   progress (its width) keep their token transitions: Base UI measures and
   writes those values itself, and a spring on top of a measured CSS value
   adds nothing but a second owner. Input, textarea, command and input-group
   animate focus only.

## Consequences

- Popups are unmounted by `AnimatePresence` after their exit rather than by
  Base UI; a consumer who renders a popup part outside its root gets it
  without motion.
- Every interactive primitive depends on `@intelligo/ai-motion` and
  `motion`; installing a primitive installs both.
- ADR-0017's other decisions stand: T1 is Intelligo's where it carries
  interaction, the API is shadcn's, the theme's values are Intelligo's.
