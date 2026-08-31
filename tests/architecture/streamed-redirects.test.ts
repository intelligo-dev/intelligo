/**
 * A page that streams must not redirect from the server.
 *
 * `loading.tsx` puts its segment behind a Suspense boundary, so the
 * response is committed (200) before the page has rendered. A server
 * `redirect()` thrown after that point arrives mid-stream, and a
 * streamed redirect trips React #310 ("rendered more hooks than during
 * the previous render") in next/link's `useOptimistic` — the page falls
 * into the nearest error boundary instead of moving
 * (vercel/next.js#78396). The auth-login item shipped a loading.tsx for
 * the whole (auth) group beside a login page that redirects a signed-in
 * user, and the onboarding item did the same; both are gone. The
 * reference app installs every item, so it is the subject here.
 *
 * The rule: a page.tsx that calls `redirect(` (next/navigation or
 * next-intl's) must not sit under a loading.tsx — its own segment's or
 * any ancestor's. Such a page redirects through
 * a client component (`router.replace` in an effect), moves the
 * decision into a layout above the boundary, or becomes a
 * `next.config.ts` redirect. Pages with no loading.tsx above them may keep the server
 * redirect: it is a real 307.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");
const APP_DIR = path.join(ROOT, "apps/app/app");

function pages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

function callsServerRedirect(source: string): boolean {
  const importsRedirect =
    /import\s*\{[^}]*\bredirect\b[^}]*\}\s*from\s*["'](next\/navigation|@\/i18n\/navigation)["']/.test(
      source
    );
  return importsRedirect && /\bredirect\(/.test(source);
}

function loadingAbove(page: string): string | null {
  let dir = path.dirname(page);
  while (dir.startsWith(APP_DIR)) {
    const candidate = path.join(dir, "loading.tsx");
    if (existsSync(candidate)) return path.relative(ROOT, candidate);
    if (dir === APP_DIR) break;
    dir = path.dirname(dir);
  }
  return null;
}

describe("streamed redirects", () => {
  const all = pages(APP_DIR);
  const redirecting = all.filter((p) =>
    callsServerRedirect(readFileSync(p, "utf8"))
  );

  it("finds pages that redirect from the server", () => {
    // The login page redirects a signed-in user and the settings index
    // lands on its first tab — the rule must keep having a subject.
    expect(redirecting.length).toBeGreaterThan(0);
  });

  it("no server redirect sits under a loading.tsx", () => {
    const offenders = redirecting
      .map((p) => ({ page: path.relative(ROOT, p), loading: loadingAbove(p) }))
      .filter((x) => x.loading !== null)
      .map((x) => `${x.page} streams behind ${x.loading}`);

    expect(
      offenders,
      `server redirect() inside a streamed segment (React #310 on arrival):\n  ${offenders.join("\n  ")}`
    ).toEqual([]);
  });
});
