# Migrating an app to the design system

Registry items now compose with Base UI's `render` prop, depend on the
`intelligo` token contract, and name Intelligo's own components as
`@intelligo/<name>`. An app installed from an earlier registry moves in
this order.

Registry files reach an app one way only: `shadcn add <item> --overwrite`.
Never codemod or hand-edit an installed item — if the result needs to
differ, that is a seam the item should ship (open an issue or a pull
request on the registry). Hand edits belong only in your own product
code. Diff before every `--overwrite`: it replaces files you may have
changed, and anything you had changed outside a seam is drift to remove.

1. **Tooling.** `shadcn` CLI 4.21 or later.
2. **components.json.** Set `"style": "base-nova"` and add the namespace:
   `"registries": { "@intelligo": "https://intelligo.dev/r/{name}.json" }`.
3. **Tokens.** `pnpm dlx shadcn add https://intelligo.dev/r/intelligo.json`
   writes the token contract into your global CSS. Delete the old
   `--status-*`, `--brand-*`, `--space-*`, `--font-size-*`, `--weather-*`
   blocks and any `@import "@intelligo-dev/ui/src/tokens.css"`. Dark mode
   is the `.dark` class.
4. **Primitives.** Re-install every `components/ui/*` file with
   `shadcn add <name> --overwrite`. Remove `radix-ui`, `@radix-ui/*` and
   `@intelligo-dev/ui` from `package.json`.
5. **Your own code — not installed items.** Replace `asChild` with `render`
   (`<Button render={<Link href="/x" />} nativeButton={false}>`), Radix
   state variants with Base UI's (`data-[state=open]` → `data-popup-open`,
   `data-[state=active]` → `data-active`), and
   `--radix-dropdown-menu-trigger-width` with `--anchor-width`. A
   `DropdownMenuLabel` sits inside a `DropdownMenuGroup`; a `Select` whose
   value should show a label passes `items`.
6. **Registry items.** Re-install in `requires.json` order with
   `--overwrite`. Customisation stays in the seams (`lib/*-config`,
   `lib/chat-renderers.tsx`, message files).
7. **Messages.** New keys arrived in `chat`, and pages use `PageHeader`;
   add the matching entries to every non-English `messages/<locale>/*.json`.
8. **Check.** Type-check, build, and look at chat, settings and billing in
   light and dark.
