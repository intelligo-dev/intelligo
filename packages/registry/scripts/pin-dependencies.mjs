#!/usr/bin/env node
/**
 * Pins the npm dependencies of every built item to the range the
 * registry is developed and tested against: this package's own
 * `package.json`. `registry.json` names a dependency without a version,
 * so a release that bumps one here ships the bump; an item installed
 * without a range would take whatever major is newest that day.
 *
 * `@intelligo-dev/*` stays unversioned: an app has those from
 * `intelligo create` at the release it runs, and `intelligo sync`
 * refuses to install pages for another one.
 *
 * Runs after `shadcn build`, over `public/r/*.json`. A dependency with
 * no range here fails the build.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const ranges = { ...manifest.devDependencies, ...manifest.dependencies };
const out = join(root, "public/r");

/** `name@range` → `name`; a scoped name keeps its leading `@`. */
function bareName(spec) {
  const at = spec.indexOf("@", 1);
  return at === -1 ? spec : spec.slice(0, at);
}

const missing = new Set();
for (const file of readdirSync(out).filter((f) => f.endsWith(".json"))) {
  const path = join(out, file);
  const item = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(item.dependencies)) continue;
  item.dependencies = item.dependencies.map((spec) => {
    const name = bareName(spec);
    if (name.startsWith("@intelligo-dev/")) return name;
    const range = ranges[name];
    if (!range || range.startsWith("workspace:")) {
      missing.add(`${name} (${file})`);
      return spec;
    }
    return `${name}@${range}`;
  });
  writeFileSync(path, JSON.stringify(item, null, 2));
}

if (missing.size > 0) {
  console.error(
    `No range in packages/registry/package.json for:\n  ${[...missing].join("\n  ")}`
  );
  process.exit(1);
}
