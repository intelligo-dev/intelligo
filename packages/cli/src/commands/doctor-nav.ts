/**
 * Navigation seams that link to pages the app does not have. The app
 * shell and the settings shell ship their nav as seams with every
 * framework page listed; an app that installs some of the items keeps
 * links to the others, and those answer 404. The seams are the app's,
 * so this only names the links and the items that would provide them.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { stripComments } from "../module-exports.js";
import type { CheckResult, RegistryRequires } from "./doctor.js";

/** The nav seams whose links are checked. */
export const NAV_SEAMS = ["lib/nav-config.ts", "lib/settings-nav.ts"] as const;

/**
 * The route a page marker serves, without its locale and route groups:
 * `app/[locale]/(app)/settings/team/page.tsx` → `/settings/team`. Null
 * for a marker that is not a page or has a dynamic segment.
 */
export function markerRoute(marker: string): string | null {
  const match = /^app\/\[locale\]\/(.*)page\.tsx$/.exec(marker);
  if (!match) return null;
  const segments = match[1]!
    .split("/")
    .filter((s) => s !== "" && !/^\(.*\)$/.test(s));
  if (segments.some((s) => s.startsWith("["))) return null;
  return `/${segments.join("/")}`;
}

/** The string-literal `href`s a source names, comments aside. */
export function navHrefs(source: string): string[] {
  const code = stripComments(source);
  return [...code.matchAll(/\bhref\s*:\s*(["'`])(\/[^"'`]*)\1/g)].map(
    (m) => m[2]!
  );
}

export function checkNavLinks(
  root: string,
  requires: RegistryRequires
): CheckResult[] {
  const missing = new Map<string, string>();
  for (const [name, item] of Object.entries(requires.items)) {
    const route = markerRoute(item.marker);
    if (route && !existsSync(path.join(root, item.marker))) {
      missing.set(route, name);
    }
  }

  const problems: string[] = [];
  let read = 0;
  for (const seam of NAV_SEAMS) {
    const file = path.join(root, seam);
    if (!existsSync(file)) continue;
    read += 1;
    for (const href of navHrefs(readFileSync(file, "utf8"))) {
      const item = missing.get(href);
      if (item) {
        problems.push(
          `${seam} links to ${href}, a page of the ${item} item, which is not installed — install it or remove the link`
        );
      }
    }
  }

  if (read === 0) return [];
  return [
    problems.length === 0
      ? { name: "nav-links", status: "ok", detail: "every nav link has a page" }
      : { name: "nav-links", status: "warn", detail: problems.join("; ") },
  ];
}
