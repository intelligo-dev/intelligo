#!/usr/bin/env node
/**
 * Pull everything the site shows about the framework from the framework
 * itself, so the site can never claim a page or a number that doesn't
 * exist — and commit the result, so a deploy needs nothing but this
 * directory (Cloudflare builds from apps/site and never runs this).
 *
 *   pnpm sync        # repository root: builds the registry first (turbo)
 *
 * Writes:
 *   src/data/registry.json   packages/registry/registry.json, verbatim
 *   src/data/requires.json   packages/registry/requires.json, verbatim
 *   src/data/seams.json      each block's consumer-owned config files
 *   src/content/docs/…       the generated reference pages, and the snippets
 *                            in hand-written ones (scripts/docs.mjs)
 *   src/data/proof.json      counts (tests, items, ADRs, packages) and the version
 *   src/data/package-edges.json
 *                            each package's declared @intelligo-dev/* dependencies
 *   public/r/*.json          the built registry items — intelligo.dev/r/<item>.json
 *                            is the hosted registry consumers install from
 *   public/llms.txt          a curated Markdown index of the docs, for an
 *   public/llms-full.txt     LLM/agent (llmstxt.org) — the docs concatenated
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DOCS_DIR,
  applySnippets,
  docFiles,
  generateData,
  generateDocs,
  generateLlmsTxt,
  isGenerated,
} from "./docs.mjs";

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// apps/site lives inside the framework repository: two directories up.
const FRAMEWORK = resolve(SITE, "../..");

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith("."))
      continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// --- registry -------------------------------------------------------------
const registryJson = readFileSync(
  join(FRAMEWORK, "packages/registry/registry.json"),
  "utf8"
);
mkdirSync(join(SITE, "src/data"), { recursive: true });
writeFileSync(join(SITE, "src/data/registry.json"), registryJson);
const registry = JSON.parse(registryJson);

const built = join(FRAMEWORK, "packages/registry/public/r");
if (!existsSync(built)) {
  // A silent stale copy is the failure CI's "sync output is committed"
  // step exists to catch; refuse rather than half-sync.
  console.error(
    "packages/registry/public/r is not built. Run `pnpm sync` from the repository root (it builds the registry first), or `pnpm registry:build` then this script."
  );
  process.exit(1);
}
rmSync(join(SITE, "public/r"), { recursive: true, force: true });
cpSync(built, join(SITE, "public/r"), { recursive: true });
console.log(`public/r: ${readdirSync(built).length} items`);

// --- counts ---------------------------------------------------------------
const testFiles = [
  ...walk(join(FRAMEWORK, "packages")),
  ...walk(join(FRAMEWORK, "tests")),
];
const testCases = testFiles.reduce(
  (n, f) =>
    n + (readFileSync(f, "utf8").match(/^\s*(it|test)\(/gm)?.length ?? 0),
  0
);
const architectureTests = readdirSync(
  join(FRAMEWORK, "tests/architecture")
).filter((f) => f.endsWith(".test.ts")).length;
const adrs = readdirSync(join(FRAMEWORK, "docs/adr")).filter((f) =>
  /^\d{4}-.*\.md$/.test(f)
).length;
const registryItems = registry.items.filter(
  (i) => i.type === "registry:block" && i.name !== "smoke"
).length;
// Published packages only: packages/registry is a private workspace.
const publishedPackages = readdirSync(join(FRAMEWORK, "packages")).filter(
  (p) => {
    const manifest = join(FRAMEWORK, "packages", p, "package.json");
    return (
      existsSync(manifest) &&
      JSON.parse(readFileSync(manifest, "utf8")).private !== true
    );
  }
);
const packages = publishedPackages.length;

// The package graph on /architecture: every declared @intelligo-dev/*
// dependency, which the dependency-direction test holds equal to the
// imports in the source.
const SCOPE = "@intelligo-dev/";
const packageEdges = publishedPackages.sort().flatMap((p) => {
  const m = JSON.parse(
    readFileSync(join(FRAMEWORK, "packages", p, "package.json"), "utf8")
  );
  const declared = {
    ...m.dependencies,
    ...m.peerDependencies,
    ...m.optionalDependencies,
  };
  return Object.keys(declared)
    .filter((name) => name.startsWith(SCOPE))
    .sort()
    .map((name) => ({ from: p, to: name.slice(SCOPE.length) }));
});
writeFileSync(
  join(SITE, "src/data/package-edges.json"),
  JSON.stringify(packageEdges, null, 2) + "\n"
);
const version = JSON.parse(
  readFileSync(join(FRAMEWORK, "packages/core/package.json"), "utf8")
).version;

const proof = {
  sampledAt: new Date().toISOString().slice(0, 10),
  version,
  packages,
  testFiles: testFiles.length,
  testCases,
  architectureTests,
  registryItems,
  adrs,
};
writeFileSync(
  join(SITE, "src/data/proof.json"),
  JSON.stringify(proof, null, 2) + "\n"
);

// --- showcase: the real registry components, installed into the site -------
//
// The hero walkthrough and the registry explorer render the items'
// actual client components (not mock-ups). They are copied from the
// registry exactly as `shadcn add` would place them, with four import
// specifiers rewritten so they run outside Next.js:
//   @/…                      → @showcase/…      (the site's own alias root)
//   next-intl                → use-intl         (the same hooks, framework-free)
//   next/navigation          → a shim
//   @intelligo-dev/auth/client → a shim (sign-in is simulated in a preview)
// Server files (pages, actions, anything importing server-only or
// next-intl/server) are not copied; src/showcase/overrides/** is copied
// last and wins, which is where hand-written type stubs and mocks live.
const SHOWCASE_ITEMS = [
  "auth-login",
  "auth-signup",
  "auth-email-verification",
  "onboarding",
  "app-shell",
  "dashboard",
  "team-settings",
  "pricing",
  "billing-settings",
  "usage",
  "notifications",
  "chat",
  "chat-panel",
  "chat-widget",
  "chat-share",
  "artifacts",
  "trial-banner",
  "feature-gating",
  "route-error",
  "invitation-accept",
  "settings-shell",
  "workspace-settings",
  "auth-password-reset",
  "language-switcher",
  "checkout",
  "payment-poll",
  "profile-settings",
  "privacy-settings",
];
const SERVER_MARKERS = [
  '"server-only"',
  "next-intl/server",
  "next/headers",
  "next/cache",
  '"use server"',
];
const showcaseRoot = join(SITE, "src/showcase/app");

function rewrite(source) {
  return source
    .split("\n")
    .filter((line) => !/^import "server-only";?$/.test(line.trim()))
    .join("\n")
    .replace(/from "@\//g, 'from "@showcase/')
    .replace(/import\("@\//g, 'import("@showcase/')
    .replace(/from "next-intl"/g, 'from "use-intl"')
    .replace(
      /from "next\/navigation"/g,
      'from "@showcase/shims/next-navigation"'
    )
    .replace(
      /from "@intelligo-dev\/auth\/client"/g,
      'from "@showcase/shims/auth-client"'
    );
}

function install(sourcePath, target) {
  const dest = join(showcaseRoot, target);
  mkdirSync(dirname(dest), { recursive: true });
  const raw = readFileSync(sourcePath, "utf8");
  writeFileSync(dest, /\.(ts|tsx)$/.test(target) ? rewrite(raw) : raw);
}

let installed = 0;
for (const name of SHOWCASE_ITEMS) {
  const item = registry.items.find((i) => i.name === name);
  if (!item) throw new Error(`showcase item ${name} is not in registry.json`);
  for (const file of item.files ?? []) {
    const { path: relPath, target, type } = file;
    if (!target || target.startsWith("app/") || target.startsWith("actions/"))
      continue;
    if (
      !["registry:component", "registry:hook", "registry:file"].includes(type)
    )
      continue;
    const source = join(FRAMEWORK, "packages/registry", relPath);
    if (/\.(ts|tsx)$/.test(target)) {
      const text = readFileSync(source, "utf8");
      if (SERVER_MARKERS.some((m) => text.includes(m))) continue;
    }
    install(source, target);
    installed++;
  }
}

// The shadcn primitives the items render with, from the reference app —
// the same files `shadcn add` would install for a consumer.
const primitives = join(FRAMEWORK, "apps/app/components/ui");
for (const f of readdirSync(primitives)) {
  if (f === "sonner.tsx") continue; // next-themes; the preview mounts <Toaster /> itself
  install(join(primitives, f), `components/ui/${f}`);
  installed++;
}
install(join(FRAMEWORK, "apps/app/lib/utils.ts"), "lib/utils.ts");

// Every Intelligo component from its registry source, so /components shows
// the ones no block installs into the reference app as well.
for (const item of registry.items.filter((i) => i.type === "registry:ui")) {
  for (const { path: relPath, target } of item.files ?? []) {
    install(join(FRAMEWORK, "packages/registry", relPath), target);
    installed++;
  }
}

// Hand-written stubs and mocks, copied last so they win.
const overrides = join(SITE, "src/showcase/overrides");
if (existsSync(overrides)) cpSync(overrides, showcaseRoot, { recursive: true });

console.log(
  `showcase: ${installed} files from ${SHOWCASE_ITEMS.length} items into src/showcase/app`
);

console.log(
  `proof: v${version}, ${packages} packages, ${testCases} tests in ${testFiles.length} files, ${architectureTests} architecture suites, ${registryItems} items, ${adrs} ADRs`
);

// --- docs: generated reference pages and snippets ----------------------------
const docsRoot = join(SITE, DOCS_DIR);
for (const rel of docFiles(SITE)) {
  if (isGenerated(rel)) rmSync(join(docsRoot, rel)); // a page whose source is gone goes too
}
const pages = generateDocs(FRAMEWORK);
for (const [rel, content] of Object.entries(pages)) {
  mkdirSync(dirname(join(docsRoot, rel)), { recursive: true });
  writeFileSync(join(docsRoot, rel), content);
}
let snippetFiles = 0;
for (const rel of docFiles(SITE).filter((r) => !isGenerated(r))) {
  const file = join(docsRoot, rel);
  const before = readFileSync(file, "utf8");
  const after = applySnippets(before, FRAMEWORK);
  if (after !== before) {
    writeFileSync(file, after);
    snippetFiles++;
  }
}
for (const [rel, content] of Object.entries(generateData(FRAMEWORK))) {
  writeFileSync(join(SITE, rel), content);
}
console.log(
  `docs: ${Object.keys(pages).length} generated pages, snippets refreshed in ${snippetFiles} files`
);

// --- llms.txt: an agent-readable index and full-text mirror of the docs ---
for (const [rel, content] of Object.entries(generateLlmsTxt(SITE))) {
  writeFileSync(join(SITE, rel), content);
}
console.log("llms.txt: public/llms.txt and public/llms-full.txt written");
