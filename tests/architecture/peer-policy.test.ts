/**
 * Which dependencies a published package may own, and which it must
 * share with the application that installs it.
 *
 * The rule:
 *
 *   A package declares as a PEER every dependency whose *identity* has
 *   to be the same object as the host's — anything carrying
 *   module-level state, a React context, a live connection, a plugin's
 *   inferred types, or a type that appears in the package's own public
 *   API. Everything else is a regular dependency.
 *
 * Getting this wrong is invisible in this repository and breaks
 * consumers, which is the worst combination. pnpm hoists one copy for
 * the whole workspace and `pnpm.overrides` pins the version, so two
 * instances never happen here. In a consumer's tree they do, and then:
 * `instanceof` fails across two zod copies so a schema this package
 * exports will not validate their data; two drizzle copies mean the
 * `organization` table object a package references is not the one their
 * query builder sees; two React copies throw "invalid hook call"; and a
 * `Stripe.Event` in a handler signature is typed against a Stripe the
 * consumer does not have.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PACKAGES_DIR, listPublishedWorkspaces, walk } from "./tree";

/**
 * Packages whose identity must be shared, with why — the note is the
 * argument for anyone tempted to move one back.
 */
const SHARED_IDENTITY: Record<string, string> = {
  "drizzle-orm":
    "table objects and $inferSelect types cross the boundary; two copies mean references() and transactions silently disagree",
  zod: "exported schemas' inferred types must unify with the consumer's, and instanceof fails across copies",
  react: "hooks require exactly one copy in the tree",
  "react-dom": "must match the React copy that renders",
  "better-auth":
    "plugin type inference is the whole public surface of the auth package",
  stripe: "Stripe.Event appears in an exported handler signature",
  next: "framework singleton; only the transport adapter may require it",
};

type Manifest = {
  name?: string;
  private?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
};

const packages = listPublishedWorkspaces(PACKAGES_DIR).map((dir) => {
  const manifest = JSON.parse(
    readFileSync(path.join(PACKAGES_DIR, dir, "package.json"), "utf8")
  ) as Manifest;
  return { dir, manifest };
});

describe("peer dependency policy", () => {
  it.each(packages)(
    "$dir declares shared-identity packages as peers",
    ({ dir, manifest }) => {
      const offenders = Object.keys(manifest.dependencies ?? {}).filter(
        (name) => name in SHARED_IDENTITY
      );

      expect(
        offenders.map((name) => `${name} — ${SHARED_IDENTITY[name]}`),
        `${dir} owns a dependency whose identity must be shared with the host`
      ).toEqual([]);
    }
  );

  it.each(packages)(
    "$dir can build and test what it peers",
    ({ dir, manifest }) => {
      // A peer is not installed for the declaring workspace, so without a
      // matching devDependency the package cannot type-check or run its
      // own tests — and the failure only appears on a clean install.
      //
      // Optional peers are exempt: `@intelligo-dev/mastra` declares
      // `@mastra/core` and deliberately imports nothing from it, so the
      // bridge stays removable. Installing it here would only prove that.
      const missing = Object.keys(manifest.peerDependencies ?? {}).filter(
        (name) =>
          manifest.peerDependenciesMeta?.[name]?.optional !== true &&
          !(manifest.devDependencies ?? {})[name]
      );

      expect(missing, `${dir} peers these without a devDependency`).toEqual([]);
    }
  );

  it.each(packages)(
    "$dir does not require a framework it never imports",
    ({ dir, manifest }) => {
      // `next` was a mandatory peer of core and billing, neither of which
      // imports it: every consumer — a queue worker, a cron runner, a
      // Hono API that only wants core/db — was made to install Next, and
      // a product on another framework was locked out for nothing.
      const peersNext = "next" in (manifest.peerDependencies ?? {});
      if (!peersNext) return;

      const optional = manifest.peerDependenciesMeta?.next?.optional === true;
      const importsNext = sourceImportsNext(dir);

      expect(
        importsNext || optional,
        `${dir} requires next as a peer but imports nothing from it — drop the peer, or mark it optional`
      ).toBe(true);
    }
  );
});

describe("the framework's one door to Next.js", () => {
  it("exists, and imports next", () => {
    // Without this the rule below is vacuous: an exclusion for a file
    // that has moved would pass while enforcing nothing.
    expect(
      readFileSync(path.join(PACKAGES_DIR, "next/src/index.ts"), "utf8")
    ).toMatch(/from "next\/headers"/);
  });

  it("is the only package that imports next/*", () => {
    // Every other package has to be usable from a queue worker, a Hono
    // API, a test, or a product built on something that is not Next.
    // `auth` used to import `next/headers` in five files, which made a
    // package about authentication unusable outside a Next request —
    // the reason `@intelligo-dev/next` exists.
    const ALLOWED = "packages/next/src/";
    const offenders: string[] = [];

    for (const { dir } of packages) {
      for (const file of walk(path.join(PACKAGES_DIR, dir, "src"), (name) =>
        /\.tsx?$/.test(name)
      )) {
        if (/\.test\.tsx?$/.test(file)) continue;
        const rel = path.relative(PACKAGES_DIR, file);
        if (`packages/${rel}`.split(path.sep).join("/").startsWith(ALLOWED))
          continue;
        if (/from\s+["']next(\/[^"']+)?["']/.test(readFileSync(file, "utf8"))) {
          offenders.push(`packages/${rel}`);
        }
      }
    }

    expect(
      offenders,
      `these import next/* directly; go through @intelligo-dev/next instead:\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});

function sourceImportsNext(dir: string): boolean {
  return walk(path.join(PACKAGES_DIR, dir, "src"), (name) =>
    /\.tsx?$/.test(name)
  ).some((file) =>
    /from\s+["']next(\/[^"']+)?["']/.test(readFileSync(file, "utf8"))
  );
}
