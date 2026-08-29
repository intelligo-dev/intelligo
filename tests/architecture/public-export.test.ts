/**
 * The public-export gate.
 *
 * ADR-0001 and ADR-0006 commit to a public repository built from an
 * allowlisted subset of these packages, with a clean initial commit —
 * this repository's history is never published. That makes extraction
 * a one-way door: anything that leaks is public permanently, and no
 * later commit takes it back.
 *
 * So the audit runs continuously rather than once at extraction time.
 * The dependency-direction test already forbids the *imports*; this
 * one covers what an import graph cannot see — vocabulary in strings
 * and comments, credentials, internal identifiers, and the licence
 * metadata a published package needs.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { ROOT, hasExtractionScript, hasPrivateWorkspace } from "./scope";

const PACKAGES_DIR = path.join(ROOT, "packages");

/**
 * Every package directory must appear in exactly one list, so adding a
 * package forces a decision instead of defaulting to either answer.
 * `agents`, `ai` and `chat` are the set ADR-0008 decided to dissolve:
 * they stay in this repository, are never extracted, and no public
 * package may point at one.
 *
 * Read from the same file the extraction script reads, so the gate and
 * the thing it gates cannot disagree about what is public.
 */
const allowlist = JSON.parse(
  readFileSync(path.join(ROOT, "config/public-packages.json"), "utf8")
) as { public: string[]; deprecated: string[] };

const PUBLIC_PACKAGES = allowlist.public;
const DEPRECATED_PACKAGES = allowlist.deprecated;

/** Names that must never appear in a package headed for publication. */
const PRIVATE_VOCABULARY = [
  "@intelligo/support",
  "@intelligo/acme",
  "product/app",
  "product/app",
  "product/app-web",
];

/**
 * Credential shapes, written to match real values and not the
 * placeholders documentation is full of. `sk-` alone would flag every
 * `sk-...` in a comment; twenty following characters would not be
 * there by accident.
 */
const SECRET_PATTERNS: {
  name: string;
  re: RegExp;
  allow?: (match: RegExpMatchArray) => boolean;
}[] = [
  { name: "OpenAI key", re: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "Stripe secret key", re: /\bsk_(live|test)_[A-Za-z0-9]{20,}/ },
  { name: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{20,}/ },
  { name: "Resend key", re: /\bre_[A-Za-z0-9]{20,}/ },
  { name: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "private key block",
    re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: "database URL with credentials",
    re: /\bpostgres(ql)?:\/\/[^\s:@/]+:[^\s:@/]+@([^\s/]+)/,
    // Documentation is full of connection strings. A local host or a
    // placeholder password is a worked example; a real hostname with a
    // real password is the thing worth failing a build over.
    allow: (match: RegExpMatchArray) => {
      const host = (match[2] ?? "").split(":")[0]!.toLowerCase();
      return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "host" ||
        host === "postgres" ||
        host.endsWith(".example.com") ||
        host === "example.com"
      );
    },
  },
];

/**
 * Identifiers that belong to this deployment rather than to anyone who
 * installs the package. A product hostname inside a framework package
 * is both a leak and a boundary violation.
 */
const INTERNAL_IDENTIFIERS = [
  "app.example.com",
  "example.com",
  "intelligo-dev",
];

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts|cts|js|jsx|json|md|css|sql)$/.test(entry))
      out.push(full);
  }
  return out;
}

/**
 * What extraction copies. Deprecated packages are deliberately not
 * here: the audit below (secrets, licence, private vocabulary) is
 * about what becomes public, and these do not.
 */
const publishable = [...PUBLIC_PACKAGES];

/** Every package that must carry a classification. */
const classified = [...PUBLIC_PACKAGES, ...DEPRECATED_PACKAGES];

function sourcesOf(pkg: string): { file: string; text: string }[] {
  return walk(path.join(PACKAGES_DIR, pkg)).map((file) => ({
    file: path.relative(ROOT, file),
    text: readFileSync(file, "utf8"),
  }));
}

describe("public export audit", () => {
  it("classifies every package as public or deprecated", () => {
    const onDisk = readdirSync(PACKAGES_DIR).filter((entry) =>
      existsSync(path.join(PACKAGES_DIR, entry, "package.json"))
    );

    expect(
      onDisk.filter((p) => !classified.includes(p)).sort(),
      "unclassified packages — add them to ADR-0006 and to this test"
    ).toEqual([]);
  });

  it("declares Apache-2.0 on every publishable package", () => {
    const missing = publishable.filter((pkg) => {
      const manifest = path.join(PACKAGES_DIR, pkg, "package.json");
      if (!existsSync(manifest)) return false;
      const pkgJson = JSON.parse(readFileSync(manifest, "utf8"));
      return pkgJson.license !== "Apache-2.0";
    });

    expect(missing, "packages without a license field").toEqual([]);
  });

  it("ships a LICENSE and the governance documents", () => {
    for (const file of [
      "LICENSE",
      "SECURITY.md",
      "CONTRIBUTING.md",
      "TRADEMARK.md",
      // The one README is the foundation's front page too, so it must
      // stay free of private vocabulary (scanned below via rootFiles).
      "README.md",
    ]) {
      expect(existsSync(path.join(ROOT, file)), `${file} is missing`).toBe(
        true
      );
    }
    // A licence file that lost its terms is worse than none: it looks
    // settled while granting nothing.
    const license = readFileSync(path.join(ROOT, "LICENSE"), "utf8");
    expect(license).toContain("Apache License");
    expect(license).toContain(
      "TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION"
    );
  });

  it("keeps private vocabulary out of publishable packages", () => {
    const hits: string[] = [];

    for (const pkg of publishable) {
      for (const { file, text } of sourcesOf(pkg)) {
        // A file may name them in order to assert their absence — the
        // CLI's template test does exactly that. The marker has to be
        // written deliberately, which is the point.
        if (text.includes("public-export-audit: allow-private-names")) continue;
        for (const term of PRIVATE_VOCABULARY) {
          if (text.includes(term)) hits.push(`${file} mentions ${term}`);
        }
      }
    }

    expect(
      hits,
      `private names in packages headed for publication:\n  ${hits.join("\n  ")}`
    ).toEqual([]);
  });

  it("contains no credentials", () => {
    const hits: string[] = [];

    for (const pkg of publishable) {
      for (const { file, text } of sourcesOf(pkg)) {
        for (const { name, re, allow } of SECRET_PATTERNS) {
          const match = text.match(re);
          if (!match) continue;
          if (allow?.(match)) continue;
          hits.push(`${file} looks like it contains a ${name}`);
        }
      }
    }

    expect(hits, `possible credentials:\n  ${hits.join("\n  ")}`).toEqual([]);
  });

  it("contains no deployment-specific identifiers", () => {
    const hits: string[] = [];

    for (const pkg of publishable) {
      for (const { file, text } of sourcesOf(pkg)) {
        for (const term of INTERNAL_IDENTIFIERS) {
          if (text.includes(term)) hits.push(`${file} mentions ${term}`);
        }
      }
    }

    expect(
      hits,
      `identifiers belonging to this deployment, not to consumers:\n  ${hits.join("\n  ")}`
    ).toEqual([]);
  });

  it("keeps the unpublishable workspaces unpublishable", () => {
    // `private: true` is what stops `pnpm publish -r` from putting the
    // product application or the Support domain on a registry by
    // accident. It is the last line of defence, so it is asserted.
    //
    // Absent manifests are skipped rather than failed: the extracted
    // public tree has no private/ by construction (ADR-0001), and the
    // count assertion below keeps that from making this vacuous where
    // they do exist.
    const manifests = [
      "product/app/package.json",
      "private/ee-governance/package.json",
      "product/app/package.json",
      "product/app-web/package.json",
      "apps/app/package.json",
    ].filter((m) => existsSync(path.join(ROOT, m)));

    for (const manifest of manifests) {
      const pkgJson = JSON.parse(
        readFileSync(path.join(ROOT, manifest), "utf8")
      );
      expect(pkgJson.private, `${manifest} is not marked private`).toBe(true);
    }

    const expected = hasPrivateWorkspace ? 5 : 1;
    expect(
      manifests.length,
      "fewer unpublishable workspaces than expected — did one move?"
    ).toBe(expected);
  });

  // Extraction is an operation of the incubation repository; the
  // foundation has no reason to re-extract itself, so the script is not
  // among the files copied.
  it.skipIf(!hasExtractionScript)(
    "can extract a self-contained tree",
    async () => {
      // The failure this catches: an allowlisted package depending on
      // one that is not. The copy installs, then fails to resolve — and
      // you find out after the repository is public.
      const { planExtraction } = await import("../../scripts/extract-public");
      const plan = planExtraction(ROOT);

      expect(plan.problems, plan.problems.join("\n  ")).toEqual([]);
      expect(plan.packages).toEqual([...PUBLIC_PACKAGES].sort());
      // And the dissolved set stays behind (ADR-0008).
      expect(
        plan.packages.filter((p) => DEPRECATED_PACKAGES.includes(p))
      ).toEqual([]);
    }
  );
});
