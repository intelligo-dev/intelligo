/**
 * Admission holds one pooled connection for its transaction and must not
 * need a second one while it does: on a pool of one, with the billing
 * settings cache empty, it still answers instead of waiting for a
 * connection that only it could free.
 *
 * Runs against a real database when TEST_PG_URL is set. DATABASE_URL
 * must point at the same database.
 */

import { afterAll, describe, expect, it, vi } from "vitest";

import { money } from "@intelligo-dev/core/money";

const PG_URL = process.env.TEST_PG_URL;
const d = PG_URL ? describe : describe.skip;

d("admission on an exhausted pool (integration)", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("answers on a pool of one with the settings cache empty", async () => {
    vi.stubEnv("DATABASE_POOL_MAX", "1");
    vi.resetModules();
    const settings = await import("../billing-settings");
    const quota = await import("../quota");
    settings.invalidateBillingSettingsCache();
    const { currency } = await settings.getBillingSettings();
    settings.invalidateBillingSettingsCache();

    const admission = await quota.reserveQuota(`pool-ws-${Date.now()}`, {
      amount: money(1_000_000, currency),
      requestId: crypto.randomUUID(),
    });

    expect(admission.allowed).toBe(false);
  }, 5_000);
});
