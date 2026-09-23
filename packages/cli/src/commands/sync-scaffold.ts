/**
 * Scaffold files a registry install replaces. `intelligo create`
 * writes app/globals.css, the theme provider and lib/utils.ts; the
 * design-system base and the items overwrite them, and the scaffold's
 * record has to let go of them or `upgrade --check` reports them as
 * the app's own edits forever.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { readManifest } from "../manifest.js";

/** The `intelligo create` feature whose files an install may replace. */
export const SCAFFOLD_FEATURE = "app-scaffold";

/**
 * Scaffold files the install extends in place rather than replaces:
 * shadcn adds dependencies to package.json and style fields to
 * components.json, and both stay the app's.
 */
const EDITED_IN_PLACE: ReadonlySet<string> = new Set([
  "package.json",
  "components.json",
]);

/**
 * The scaffold files an install has made the registry's: a file an
 * installed item ships, the Tailwind stylesheet once the design-system
 * base is in (it rewrites the tokens), or any scaffold file the install
 * changed (shadcn's own `utils`, `sonner`). Seams stay the app's, and
 * so do the files shadcn only extends. Left in the scaffold's record,
 * each would read `customized` in `upgrade --check` forever.
 */
export function scaffoldHandover(input: {
  scaffold: readonly string[];
  changed: ReadonlySet<string>;
  shipped: ReadonlySet<string>;
  seams: Readonly<Record<string, string>>;
  css: string | null;
}): string[] {
  return input.scaffold.filter(
    (file) =>
      !(file in input.seams) &&
      !EDITED_IN_PLACE.has(file) &&
      (input.shipped.has(file) || file === input.css || input.changed.has(file))
  );
}

function readIfExists(file: string): string | null {
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/**
 * The scaffold's recorded files as they are before an install, and
 * afterwards the ones the install made the registry's.
 */
export function snapshotScaffold(appRoot: string): {
  handedOver: (input: {
    shipped: ReadonlySet<string>;
    seams: Readonly<Record<string, string>>;
    css: string | null;
  }) => string[];
} {
  const scaffold = (
    readManifest(appRoot)?.features[SCAFFOLD_FEATURE]?.files ?? []
  ).map((f) => f.path);
  const before = new Map(
    scaffold.map((f) => [f, readIfExists(path.join(appRoot, f))])
  );
  return {
    handedOver: (input) =>
      scaffoldHandover({
        ...input,
        scaffold,
        changed: new Set(
          scaffold.filter(
            (f) => readIfExists(path.join(appRoot, f)) !== before.get(f)
          )
        ),
      }),
  };
}
