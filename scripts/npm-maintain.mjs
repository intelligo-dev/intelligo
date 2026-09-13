#!/usr/bin/env node
/**
 * Registry maintenance that npm trusted publishing cannot do.
 *
 * The release workflow publishes with an OIDC identity and holds no
 * npm token, and npm accepts that identity for `publish` only. The two
 * other things a release needs are done here, by a maintainer logged
 * in to npm (`npm login`; npm asks for a one-time password):
 *
 *   1. every entry in scripts/npm-deprecations.json is applied, once —
 *      npm answers 422 to a deprecation that changes nothing, so an
 *      entry whose message is already on the registry is skipped;
 *   2. while a package has no stable release, `latest` follows its
 *      newest prerelease, so a bare `npm install` does not resolve to
 *      an old beta. Once a stable version exists the release workflow
 *      owns `latest` and this leaves it alone.
 *
 *   node scripts/npm-maintain.mjs            # apply
 *   node scripts/npm-maintain.mjs --dry-run  # print what would change
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const dryRun = process.argv.includes("--dry-run");

/** `npm view <spec> <field> --json`, or undefined when there is nothing. */
function view(spec, field) {
  try {
    const out = execFileSync("npm", ["view", spec, field, "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out ? JSON.parse(out) : undefined;
  } catch {
    return undefined;
  }
}

function npm(args) {
  console.log(`$ npm ${args.map((a) => JSON.stringify(a)).join(" ")}`);
  if (dryRun) return;
  const result = spawnSync("npm", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const { deprecations } = JSON.parse(
  readFileSync(new URL("./npm-deprecations.json", import.meta.url), "utf8")
);
for (const { name, message } of deprecations) {
  if (view(name, "versions") === undefined) {
    console.log(`${name} was never on npm — nothing to deprecate`);
    continue;
  }
  if (view(name, "deprecated") === message) {
    console.log(`${name} is already deprecated with this message`);
    continue;
  }
  npm(["deprecate", `${name}@*`, message]);
}

const packages = new URL("../packages/", import.meta.url);
for (const dir of readdirSync(packages)) {
  const manifest = new URL(`${dir}/package.json`, packages);
  if (!existsSync(manifest)) continue;
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  if (pkg.private) continue;

  const versions = [view(pkg.name, "versions") ?? []].flat();
  if (versions.length === 0) continue;
  if (versions.some((v) => !v.includes("-"))) {
    console.log(`${pkg.name} has a stable release — latest is the workflow's`);
    continue;
  }
  const newest = versions.at(-1);
  const latest = view(pkg.name, "dist-tags")?.latest;
  if (latest === newest) {
    console.log(`${pkg.name}: latest is ${newest}`);
    continue;
  }
  npm(["dist-tag", "add", `${pkg.name}@${newest}`, "latest"]);
}
