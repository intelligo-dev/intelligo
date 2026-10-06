/**
 * The organization endpoints the services wrap answer 404 over HTTP, so a
 * client cannot reach them past the limits and hooks the services apply.
 * The switcher's `set-active` still routes.
 *
 * Runs when TEST_PG_URL is set (Better-Auth needs its database to start).
 */

import { describe, expect, it } from "vitest";

import { SERVICE_ONLY_ORGANIZATION_PATHS } from "./request-hardening";

const d = process.env.TEST_PG_URL ? describe : describe.skip;

d("organization endpoints over HTTP (integration)", () => {
  const post = async (path: string) => {
    const { auth } = await import("./server");
    const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";
    return auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: "{}",
      })
    );
  };

  it.each([...SERVICE_ONLY_ORGANIZATION_PATHS])("closes %s", async (path) => {
    expect((await post(path)).status).toBe(404);
  });

  it("keeps set-active routed", async () => {
    expect((await post("/organization/set-active")).status).not.toBe(404);
  });
});
