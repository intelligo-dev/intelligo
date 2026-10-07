/**
 * Every seam says where it runs: `client` when the browser bundles it —
 * a `"use client"` file reaches it through imports that are not
 * `import type`, and not through a `"use server"` module, whose code
 * stays on the server — and `server` otherwise. A seam the browser bundles
 * must not import server code or read a secret, and a deployment
 * editing it has no other way to know that; `intelligo doctor` reads
 * `boundaries` from requires.json and warns.
 *
 * Derived here from the registry's own sources, so the declaration
 * cannot drift from what the items do.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ROOT } from "./tree";

const REGISTRY = path.join(ROOT, "packages/registry");

type RegistryJson = {
  items: Array<{ files?: Array<{ path: string; target?: string }> }>;
};
type Requires = {
  seams: Record<string, string>;
  boundaries?: Record<string, string>;
};

const registry = JSON.parse(
  readFileSync(path.join(REGISTRY, "registry.json"), "utf8")
) as RegistryJson;
const requires = JSON.parse(
  readFileSync(path.join(REGISTRY, "requires.json"), "utf8")
) as Requires;

/** `@/lib/chat-config` → the registry source that ships at that target. */
const sourceOf = new Map<string, string>();
for (const item of registry.items) {
  for (const file of item.files ?? []) {
    if (!file.target) continue;
    const specifier = `@/${file.target.replace(/\.(tsx?|jsx?)$/, "")}`;
    sourceOf.set(specifier, file.path);
  }
}

/** The `@/…` modules a file imports for more than their types. */
function valueImports(source: string): string[] {
  const out: string[] = [];
  const pattern =
    /^\s*(import|export)\s+(type\s+)?([^;]*?)\s*from\s*["'](@\/[^"']+)["']/gms;
  for (const match of source.matchAll(pattern)) {
    if (match[2]) continue;
    const names = match[3]!;
    const braces = /^\{([^}]*)\}$/.exec(names.trim());
    if (
      braces &&
      braces[1]!
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean)
        .every((n) => n.startsWith("type "))
    ) {
      continue;
    }
    out.push(match[4]!);
  }
  return out;
}

const read = (file: string) => readFileSync(path.join(REGISTRY, file), "utf8");
const directive = (name: string) =>
  new RegExp(
    `^\\s*(\\/\\/[^\\n]*\\n|\\/\\*[\\s\\S]*?\\*\\/\\s*)*["']use ${name}["']`
  );
const isClient = (source: string) => directive("client").test(source);
/** A server action: the client imports a reference to it, not its code. */
const isServerActions = (source: string) => directive("server").test(source);

/** Every registry source the browser bundles. */
function clientBundled(): Set<string> {
  const files = [...new Set(sourceOf.values())];
  const reached = new Set(files.filter((file) => isClient(read(file))));
  const queue = [...reached];
  while (queue.length > 0) {
    const file = queue.pop()!;
    for (const specifier of valueImports(read(file))) {
      const target = sourceOf.get(specifier);
      if (target && !reached.has(target) && !isServerActions(read(target))) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  return reached;
}

describe("seam boundaries", () => {
  const bundled = clientBundled();
  const derived = Object.fromEntries(
    Object.keys(requires.seams).map((seam) => {
      const source = sourceOf.get(`@/${seam.replace(/\.(tsx?|jsx?)$/, "")}`);
      return [seam, source && bundled.has(source) ? "client" : "server"];
    })
  );

  it("requires.json declares where every seam runs, as the items use it", () => {
    expect(requires.boundaries).toEqual(derived);
  });

  it("no seam the browser bundles imports server-only", () => {
    const offenders = Object.entries(derived)
      .filter(([, boundary]) => boundary === "client")
      .map(([seam]) => sourceOf.get(`@/${seam.replace(/\.(tsx?|jsx?)$/, "")}`)!)
      .filter((file) => /import\s+["']server-only["']/.test(read(file)));
    expect(offenders).toEqual([]);
  });
});
