/**
 * The middleware's protected-route list against the filesystem.
 *
 * The list is a courtesy, not the gate — the authenticated layout wraps
 * the whole `(app)` group and checks the real session, so a route
 * missing from it is still protected. What the visitor loses is the
 * `callbackUrl` that returns them to where they were going, and what
 * the reader loses is the ability to trust the list at all.
 *
 * It had drifted to naming two routes that do not exist and omitting
 * eight that do. A hand-maintained list stays honest only if something
 * checks it.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { ROOT, hasIgniteApp } from "./scope";

const APP_GROUP = path.join(ROOT, "product/app/app/[locale]/(app)");
const PROXY = path.join(ROOT, "product/app/proxy.ts");

/** Read the list out of the source rather than importing "next/server". */
function declaredRoutes(): string[] {
  const source = readFileSync(PROXY, "utf8");
  const block = source.slice(
    source.indexOf("export const PROTECTED_ROUTES = ["),
    source.indexOf("];", source.indexOf("export const PROTECTED_ROUTES = ["))
  );
  return [...block.matchAll(/"(\/[a-z-]+)"/g)].map((m) => m[1]!).sort();
}

function routeDirectories(): string[] {
  return readdirSync(APP_GROUP)
    .filter((entry) => statSync(path.join(APP_GROUP, entry)).isDirectory())
    .map((entry) => `/${entry}`)
    .sort();
}

describe.skipIf(!hasIgniteApp)("middleware protected routes", () => {
  it("finds both sides", () => {
    // Either side coming back empty would make the comparison vacuous.
    expect(declaredRoutes().length).toBeGreaterThan(5);
    expect(routeDirectories().length).toBeGreaterThan(5);
  });

  it("matches the (app) route group exactly", () => {
    expect(declaredRoutes()).toEqual(routeDirectories());
  });
});
