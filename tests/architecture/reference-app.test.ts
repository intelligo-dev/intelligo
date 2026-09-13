/**
 * `apps/app` is the registry's canonical installed result (AGENTS.md):
 * it is created with `intelligo create` and every item is installed with
 * `shadcn add`. Nothing reaches it by hand (ADR-0010). So every file an
 * item ships must match its registry source as the CLI writes it, except
 * the seams a deployment is meant to edit. A difference anywhere else is
 * drift — fix the registry item and re-install, never the app.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { ROOT } from "./tree";

const APP = path.join(ROOT, "apps/app");
const REGISTRY = path.join(ROOT, "packages/registry");

/** Consumer-owned configuration an item ships for the deployment to edit, each with its reason. */
const SEAMS: [RegExp, string][] = [
  [/^messages\//, "copy and locales are the deployment's (ADR-0010)"],
  [/^lib\/shell-config\.tsx$/, "shell banner and header slots"],
  [/^lib\/nav-config\.ts$/, "navigation"],
  [/^lib\/settings-nav\.ts$/, "settings tabs"],
  [/^lib\/chat-config\.tsx$/, "agent identity, starters, header slot"],
  [/^lib\/chat-renderers\.tsx$/, "tool-call renderers"],
  [/^lib\/chat-model\.ts$/, "the deployment's model"],
  [/^lib\/chat-server-config\.ts$/, "the chat transport's seams (ADR-0012)"],
  [/^lib\/onboarding-steps\.ts$/, "onboarding steps"],
  [/^lib\/billing-config\.ts$/, "product slug, currency, credit bundles"],
  [/^lib\/workspace-bootstrap\.ts$/, "what a new workspace starts with"],
  [/^lib\/document-patterns\.ts$/, "artifact detection"],
  [/^lib\/dashboard-(config|data)\.tsx?$/, "dashboard copy and resume data"],
  [/^lib\/feature-catalog\.ts$/, "feature names and plans"],
  [/^lib\/[\w-]+-config\.tsx?$/, "an item's config seam"],
];

type Item = {
  name: string;
  type: string;
  files?: { path: string; type: string; target?: string }[];
};

const items = (
  JSON.parse(readFileSync(path.join(REGISTRY, "registry.json"), "utf8")) as {
    items: Item[];
  }
).items;

function installedPath(item: Item, file: NonNullable<Item["files"]>[number]) {
  if (file.target) return file.target;
  if (item.type === "registry:ui") {
    return `components/ui/${path.basename(file.path)}`;
  }
  return null;
}

/**
 * A file as `shadcn add` writes it: the CLI drops the comment block that
 * opens a file, so that header is not part of the comparison.
 */
function asInstalled(source: string): string {
  return source.replace(/^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*))*\s*/, "");
}

/**
 * What the app installs: every block, and every component a block pulls in
 * through `@intelligo/<name>` (transitively). A registry:ui item no block
 * uses is not part of the app.
 */
const byName = new Map(items.map((item) => [item.name, item] as const));
const installed = new Set<string>();
const visit = (name: string) => {
  if (installed.has(name)) return;
  const item = byName.get(name);
  if (!item) return;
  installed.add(name);
  for (const dep of (item as Item & { registryDependencies?: string[] })
    .registryDependencies ?? []) {
    if (dep.startsWith("@intelligo/")) visit(dep.slice("@intelligo/".length));
  }
};
for (const item of items) if (item.type === "registry:block") visit(item.name);

const shipped = items
  .filter((item) => installed.has(item.name))
  .flatMap((item) =>
    (item.files ?? [])
      .map((file) => ({
        item: item.name,
        source: file.path,
        target: installedPath(item, file),
      }))
      .filter(
        (f): f is { item: string; source: string; target: string } =>
          f.target !== null
      )
  );

describe("the reference app is the registry, installed", () => {
  it("has registry files to compare", () => {
    expect(shipped.length).toBeGreaterThan(150);
  });

  it("installs every item file", () => {
    const missing = shipped
      .filter((f) => !existsSync(path.join(APP, f.target)))
      .map((f) => `${f.item}: ${f.target}`);
    expect(
      missing,
      "re-run the install: shadcn add <item> --overwrite"
    ).toEqual([]);
  });

  it("keeps every installed file identical to its source, seams aside", () => {
    const drift = shipped
      .filter((f) => !SEAMS.some(([pattern]) => pattern.test(f.target)))
      .filter((f) => existsSync(path.join(APP, f.target)))
      .filter(
        (f) =>
          asInstalled(readFileSync(path.join(APP, f.target), "utf8")) !==
          asInstalled(readFileSync(path.join(REGISTRY, f.source), "utf8"))
      )
      .map((f) => `${f.item}: ${f.target}`);
    expect(
      drift,
      "apps/app differs from the registry — change packages/registry/base and re-install, never the app"
    ).toEqual([]);
  });
});
