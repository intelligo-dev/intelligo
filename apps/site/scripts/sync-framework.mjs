#!/usr/bin/env node
/**
 * Pull everything the site shows about the framework from the framework
 * itself, so the site can never claim a page or a number that doesn't
 * exist — and commit the result, so a deploy needs no sibling checkout.
 *
 *   pnpm sync                      # this repository (+ ../intelligo for history, if present)
 *   INTELLIGO_FRAMEWORK_DIR=… pnpm sync
 *
 * Writes:
 *   src/data/registry.json   the framework's registry.json, verbatim
 *   src/data/proof.json      counts (tests, items, ADRs) and the commit history
 *   public/r/*.json          the built registry items — intelligo.dev/r/<item>.json
 *                            is the hosted registry consumers install from
 *
 * The commit history comes from the incubation repository when it is
 * present: the framework's public history starts from a clean commit
 * (ADR-0001), and the seven months before it are the story the site tells.
 */
import { execSync } from "node:child_process";
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

const SITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// apps/site lives inside the framework repository, so the framework is
// two directories up. The incubation repository, when present as a
// sibling of this repository, supplies the pre-public commit history.
const FRAMEWORK = resolve(process.env.INTELLIGO_FRAMEWORK_DIR ?? join(SITE, "../.."));
const INCUBATION = resolve(process.env.INTELLIGO_INCUBATION_DIR ?? join(FRAMEWORK, "../intelligo"));

if (!existsSync(join(FRAMEWORK, "registry/registry.json"))) {
  console.error(`No framework checkout at ${FRAMEWORK} (set INTELLIGO_FRAMEWORK_DIR).`);
  process.exit(1);
}

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

// --- registry -------------------------------------------------------------
const registryJson = readFileSync(join(FRAMEWORK, "registry/registry.json"), "utf8");
mkdirSync(join(SITE, "src/data"), { recursive: true });
writeFileSync(join(SITE, "src/data/registry.json"), registryJson);
const registry = JSON.parse(registryJson);

const built = join(FRAMEWORK, "registry/public/r");
if (existsSync(built)) {
  rmSync(join(SITE, "public/r"), { recursive: true, force: true });
  cpSync(built, join(SITE, "public/r"), { recursive: true });
  console.log(`public/r: ${readdirSync(built).length} items`);
} else {
  console.warn(`public/r left as-is: run \`pnpm registry:build\` in ${FRAMEWORK} first.`);
}

// --- counts ---------------------------------------------------------------
const testFiles = [...walk(join(FRAMEWORK, "packages")), ...walk(join(FRAMEWORK, "tests"))];
const testCases = testFiles.reduce(
  (n, f) => n + (readFileSync(f, "utf8").match(/^\s*(it|test)\(/gm)?.length ?? 0),
  0
);
const architectureTests = readdirSync(join(FRAMEWORK, "tests/architecture")).filter((f) =>
  f.endsWith(".test.ts")
).length;
const adrs = readdirSync(join(FRAMEWORK, "docs/adr")).filter((f) => /^\d{4}-.*\.md$/.test(f)).length;
const registryItems = registry.items.filter((i) => i.name !== "smoke").length;
const packages = readdirSync(join(FRAMEWORK, "packages")).filter((p) =>
  existsSync(join(FRAMEWORK, "packages", p, "package.json"))
).length;
const version = JSON.parse(readFileSync(join(FRAMEWORK, "packages/core/package.json"), "utf8")).version;

// --- history --------------------------------------------------------------
const historyRepo = existsSync(join(INCUBATION, ".git")) ? INCUBATION : FRAMEWORK;
const commits = Number(sh("git rev-list --count HEAD", historyRepo));
const firstCommit = sh("git log --reverse --format=%ad --date=short", historyRepo).split("\n")[0];
const perDay = new Map();
for (const line of sh("git log --format=%ad --date=short", historyRepo).split("\n")) {
  if (line) perDay.set(line, (perDay.get(line) ?? 0) + 1);
}
const max = Math.max(1, ...perDay.values());
const year = new Date().getFullYear();
const days = [];
for (let d = new Date(Date.UTC(year, 0, 1)); d <= new Date(Date.UTC(year, 11, 31)); d.setUTCDate(d.getUTCDate() + 1)) {
  const date = d.toISOString().slice(0, 10);
  const count = perDay.get(date) ?? 0;
  const level = count === 0 ? 0 : count < max * 0.15 ? 1 : count < max * 0.35 ? 2 : count < max * 0.65 ? 3 : 4;
  days.push({ date, count, level });
}

const proof = {
  sampledAt: new Date().toISOString().slice(0, 10),
  version,
  packages,
  commits,
  firstCommit,
  historyFrom: historyRepo === INCUBATION ? "incubation" : "framework",
  testFiles: testFiles.length,
  testCases,
  architectureTests,
  registryItems,
  adrs,
  days,
};
writeFileSync(join(SITE, "src/data/proof.json"), JSON.stringify(proof, null, 2) + "\n");

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
  "artifacts",
  "trial-banner",
  "feature-gating",
];
const SERVER_MARKERS = ['"server-only"', "next-intl/server", "next/headers", "next/cache", '"use server"'];
const showcaseRoot = join(SITE, "src/showcase/app");

function rewrite(source) {
  return source
    .split("\n")
    .filter((line) => !/^import "server-only";?$/.test(line.trim()))
    .join("\n")
    .replace(/from "@\//g, 'from "@showcase/')
    .replace(/from "next-intl"/g, 'from "use-intl"')
    .replace(/from "next\/navigation"/g, 'from "@showcase/shims/next-navigation"')
    .replace(/from "@intelligo-dev\/auth\/client"/g, 'from "@showcase/shims/auth-client"');
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
    if (!target || target.startsWith("app/") || target.startsWith("actions/")) continue;
    if (!["registry:component", "registry:hook", "registry:file"].includes(type)) continue;
    const source = join(FRAMEWORK, "registry", relPath);
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

// Hand-written stubs and mocks, copied last so they win.
const overrides = join(SITE, "src/showcase/overrides");
if (existsSync(overrides)) cpSync(overrides, showcaseRoot, { recursive: true });

console.log(`showcase: ${installed} files from ${SHOWCASE_ITEMS.length} items into src/showcase/app`);

console.log(
  `proof: v${version}, ${packages} packages, ${testCases} tests in ${testFiles.length} files, ${architectureTests} architecture suites, ${registryItems} items, ${adrs} ADRs, ${commits} commits since ${firstCommit} (${proof.historyFrom})`
);
