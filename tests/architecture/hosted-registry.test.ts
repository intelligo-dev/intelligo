/**
 * intelligo.dev/r serves a release, not main.
 *
 * public/r/<version>/ keeps each release's items, and every component
 * one of them builds on is that same release's; public/r/*.json is the
 * copy of the release npm serves (proof.json's `published`). The site
 * answers with the headers the build writes: no framing, inline scripts
 * only by hash, and the registry as JSON any origin can read.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { APPS_DIR } from "./tree";

type ReleaseModule = {
  REGISTRY_URL: string;
  compareVersions: (a: string, b: string) => number;
  toRelease: (text: string, release: string) => string;
  fromRelease: (text: string, release: string) => string;
};
type HeadersModule = {
  inlineScriptHashes: (html: string) => Set<string>;
  contentSecurityPolicy: (hashes: Set<string>) => string;
  headersFile: (hashes: Set<string>) => string;
};

const SITE = path.join(APPS_DIR, "website");
const R = path.join(SITE, "public/r");
const release = (await import(
  path.join(SITE, "scripts/registry-release.mjs")
)) as ReleaseModule;
const headers = (await import(
  path.join(SITE, "src/lib/headers.mjs")
)) as HeadersModule;

const proof = JSON.parse(
  readFileSync(path.join(SITE, "src/data/proof.json"), "utf8")
) as { version: string; published?: string };
const releases = readdirSync(R).filter((f) =>
  statSync(path.join(R, f)).isDirectory()
);

describe("versions", () => {
  it("orders releases by semver precedence", () => {
    const sorted = [
      "1.1.0",
      "1.0.0",
      "1.0.0-beta.13",
      "1.0.0-beta.2",
      "1.10.0",
      "1.0.0-rc.1",
      "1.2.0",
    ].sort(release.compareVersions);
    expect(sorted).toEqual([
      "1.0.0-beta.2",
      "1.0.0-beta.13",
      "1.0.0-rc.1",
      "1.0.0",
      "1.1.0",
      "1.2.0",
      "1.10.0",
    ]);
  });

  it("names a dependency by its release, and back by the namespace", () => {
    const item = JSON.stringify({
      registryDependencies: ["skeleton", "@intelligo/button"],
      files: [{ content: 'import { Button } from "@/components/ui/button";' }],
    });
    const pinned = release.toRelease(item, "1.2.3");
    expect(JSON.parse(pinned).registryDependencies).toEqual([
      "skeleton",
      `${release.REGISTRY_URL}/1.2.3/button.json`,
    ]);
    expect(release.fromRelease(pinned, "1.2.3")).toBe(item);
  });
});

describe("public/r", () => {
  it("keeps the release npm serves, and serves it at /r", () => {
    expect(proof.published).toBeDefined();
    const current = proof.published!;
    expect(releases).toContain(current);
    const dir = path.join(R, current);
    const top = readdirSync(R).filter((f) => f.endsWith(".json"));
    expect(top.sort()).toEqual(
      readdirSync(dir)
        .filter((f) => f.endsWith(".json"))
        .sort()
    );
    for (const f of top) {
      expect(readFileSync(path.join(R, f), "utf8"), f).toBe(
        release.fromRelease(readFileSync(path.join(dir, f), "utf8"), current)
      );
    }
  });

  it("keeps the tree's own version once it is on npm", () => {
    if (release.compareVersions(proof.published!, proof.version) >= 0) {
      expect(releases).toContain(proof.version);
    }
  });

  it.each(releases)(
    "%s: every component an item builds on is the same release's",
    (version) => {
      const dir = path.join(R, version);
      for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
        const item = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as {
          registryDependencies?: string[];
        };
        for (const dep of item.registryDependencies ?? []) {
          expect(dep, `${version}/${f}`).not.toMatch(/^@intelligo\//);
          if (!dep.startsWith("https://")) continue;
          const prefix = `${release.REGISTRY_URL}/${version}/`;
          expect(dep.startsWith(prefix), `${version}/${f}: ${dep}`).toBe(true);
          expect(
            existsSync(path.join(dir, dep.slice(prefix.length))),
            `${version}/${f}: ${dep}`
          ).toBe(true);
        }
      }
    }
  );
});

describe("_headers", () => {
  it("hashes executed inline scripts only", () => {
    const html = [
      "<script>a()</script>",
      '<script type="module">b()</script>',
      '<script type="application/ld+json">{"x":1}</script>',
      '<script src="/c.js"></script>',
    ].join("");
    expect(headers.inlineScriptHashes(html)).toEqual(
      new Set([
        "'sha256-qVpDBgj7bpq5hMAcGp3AOc79J3Y1Z4HvySTwKrWDoy4='",
        "'sha256-cf242PFc/kb7xD0Qzhsmd9vvRkc+cWFmbi+k+YvtdKc='",
      ])
    );
  });

  it("refuses framing and runs no script it did not hash", () => {
    const csp = headers.contentSecurityPolicy(new Set(["'sha256-x'"]));
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toMatch(/script-src 'self' 'wasm-unsafe-eval' 'sha256-x'(;|$)/);
    expect(csp).not.toContain("'unsafe-inline' 'sha256");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
  });

  it("serves the registry as JSON to any origin", () => {
    const file = headers.headersFile(new Set());
    const rule = file.slice(file.indexOf("/r/*"));
    expect(rule).toContain("Content-Type: application/json");
    expect(rule).toContain("Access-Control-Allow-Origin: *");
    expect(file).toContain("X-Content-Type-Options: nosniff");
  });
});
