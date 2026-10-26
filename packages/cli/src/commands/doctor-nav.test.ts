import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { checkNavLinks, markerRoute, navHrefs } from "./doctor-nav.js";
import { runChecks } from "./doctor.js";
import type { RegistryRequires } from "./doctor.js";

describe("markerRoute", () => {
  it("is the page's path without the locale and route groups", () => {
    expect(markerRoute("app/[locale]/(app)/settings/team/page.tsx")).toBe(
      "/settings/team"
    );
    expect(markerRoute("app/[locale]/(app)/usage/page.tsx")).toBe("/usage");
  });

  it("is null for a marker that is not a page or has a dynamic segment", () => {
    expect(markerRoute("components/chat/chat-panel.tsx")).toBeNull();
    expect(markerRoute("app/[locale]/(app)/layout.tsx")).toBeNull();
    expect(markerRoute("app/[locale]/share/[id]/page.tsx")).toBeNull();
  });
});

describe("navHrefs", () => {
  it("reads string-literal hrefs and skips commented ones", () => {
    const source = [
      '/** e.g. `{ href: "/settings/ai" }` */',
      'const a = { href: "/settings/team", titleKey: "x" };',
      "const b = { href: '/usage' };",
      '// { href: "/pricing" }',
      "const c = { href: base + '/x' };",
    ].join("\n");
    expect(navHrefs(source)).toEqual(["/settings/team", "/usage"]);
  });
});

describe("checkNavLinks", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const requires: RegistryRequires = {
    scaffold: [],
    items: {
      "team-settings": { marker: "app/[locale]/(app)/settings/team/page.tsx" },
      "profile-settings": {
        marker: "app/[locale]/(app)/settings/profile/page.tsx",
      },
    },
  };

  const app = (files: Record<string, string>) => {
    root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-nav-"));
    for (const [rel, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      writeFileSync(path.join(root, rel), text);
    }
    return root;
  };

  const settingsNav =
    'export const tabs = [{ href: "/settings/profile" }, { href: "/settings/team" }];\n';

  it("warns about a link to an item that is not installed, naming the item", () => {
    const results = checkNavLinks(
      app({
        "lib/settings-nav.ts": settingsNav,
        "app/[locale]/(app)/settings/profile/page.tsx": "",
      }),
      requires
    );
    expect(results).toEqual([
      expect.objectContaining({
        name: "nav-links",
        status: "warn",
        detail: expect.stringContaining(
          "/settings/team, a page of the team-settings item"
        ),
      }),
    ]);
    expect(results[0]!.detail).not.toContain("profile-settings");
  });

  it("is ok once every linked item is installed", () => {
    const results = checkNavLinks(
      app({
        "lib/settings-nav.ts": settingsNav,
        "app/[locale]/(app)/settings/profile/page.tsx": "",
        "app/[locale]/(app)/settings/team/page.tsx": "",
      }),
      requires
    );
    expect(results[0]!.status).toBe("ok");
  });

  it("says nothing for an app with no nav seams", () => {
    expect(checkNavLinks(app({}), requires)).toEqual([]);
  });
});

describe("doctor: the maintenance route", () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("warns, naming the purge, when an app has no maintenance route", () => {
    root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-maint-"));
    mkdirSync(path.join(root, "lib"));
    writeFileSync(path.join(root, "lib", "intelligo.ts"), "");
    const result = runChecks({ root, env: {} }).find(
      (r) => r.name === "maintenance"
    );
    expect(result).toMatchObject({
      status: "warn",
      detail: expect.stringMatching(/never purged.*intelligo add maintenance/),
    });
  });

  it("checks nothing outside an app", () => {
    root = mkdtempSync(path.join(tmpdir(), "intelligo-doctor-maint-"));
    expect(
      runChecks({ root, env: {} }).find((r) => r.name === "maintenance")
    ).toBeUndefined();
  });
});
