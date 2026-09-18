#!/usr/bin/env node
/**
 * Copies packages/registry/requires.json into templates/, where a
 * published `intelligo doctor` reads it (doctor.ts, bundledRequires),
 * and derives templates/registry-items.json from registry.json: the
 * title and description of every page item, which `intelligo create`
 * offers to install.
 *
 * The registry's files are the contract; these copies are what ships in
 * the tarball. They are regenerated on every build and committed, because
 * CI runs doctor from source before anything is built — and
 * tests/architecture/registry.test.ts fails if the commit is stale.
 *
 * A relative path rather than a workspace dependency: the CLI declares
 * no @intelligo-dev/* edge at all (dependency-direction), so that
 * `doctor` never needs the application to boot before it can say why
 * the application cannot boot. Outside the monorepo — a packed
 * tarball — the source is absent and the committed copy stands.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const registryDir = resolve(here, "../../registry");
const templatesDir = resolve(here, "../templates");

/** The pages `create` offers; `smoke` is the build's canary, not a page. */
export function registryItems(registry) {
  const items = {};
  for (const item of registry.items) {
    if (item.type !== "registry:block" || item.name === "smoke") continue;
    items[item.name] = { title: item.title, description: item.description };
  }
  return { items };
}

if (existsSync(resolve(registryDir, "requires.json"))) {
  copyFileSync(
    resolve(registryDir, "requires.json"),
    resolve(templatesDir, "registry-requires.json")
  );
  const registry = JSON.parse(
    readFileSync(resolve(registryDir, "registry.json"), "utf8")
  );
  writeFileSync(
    resolve(templatesDir, "registry-items.json"),
    JSON.stringify(registryItems(registry), null, 2) + "\n"
  );
}
