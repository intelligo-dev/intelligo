/**
 * The payment-poll callback answers in the provider's own form when the
 * provider names one, and with its JSON summary otherwise.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const settle = vi.fn();
let provider: Record<string, unknown> = {};

vi.mock("@/lib/intelligo", () => ({ composeIntelligo: () => {} }));
vi.mock("@/lib/local-payment-grant", () => ({ grantLocalPayment: vi.fn() }));
vi.mock("@intelligo-dev/billing", () => ({
  isBillingServiceError: (error: unknown) =>
    typeof error === "object" && error !== null && "code" in error,
  settlePendingLocalInvoices: (input: unknown) => settle(input),
}));
vi.mock("@intelligo-dev/billing/payment", () => ({
  currentPaymentMode: () => "under-test",
  getPaymentProviderFor: () => provider,
}));

const { POST } = await import("../base/payment-poll/routes/callback");

const callback = () =>
  POST(new Request("https://app.test/api/webhooks/local-payment?invoice=i-1"));

describe("local payment callback", () => {
  beforeEach(() => {
    settle.mockReset();
    provider = { invoiceIdFromCallback: async () => "i-1" };
  });

  it("answers { ok }, 200 when settled and 500 when not, and nothing more", async () => {
    settle.mockResolvedValue({ paid: 1, pending: 0, failed: 0, errors: [] });
    const ok = await callback();
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });

    settle.mockResolvedValue({
      paid: 0,
      pending: 0,
      failed: 0,
      errors: ["i-1: relation payments: connection refused"],
    });
    const failed = await callback();
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ ok: false });

    settle.mockRejectedValue({ code: "payment_mismatch" });
    expect(await (await callback()).json()).toEqual({ ok: false });
  });

  it("answers in the provider's form when it names one", async () => {
    const seen: boolean[] = [];
    provider.callbackResponse = ({ settled }: { settled: boolean }) => {
      seen.push(settled);
      return new Response(settled ? "SUCCESS" : "RETRY", {
        status: settled ? 200 : 503,
      });
    };

    settle.mockResolvedValue({ paid: 1, pending: 0, failed: 0, errors: [] });
    const ok = await callback();
    expect(await ok.text()).toBe("SUCCESS");

    settle.mockRejectedValue({ code: "payment_mismatch" });
    const retry = await callback();
    expect(retry.status).toBe(503);
    expect(seen).toEqual([true, false]);
  });

  it("has no callback for a provider that reads none", async () => {
    provider = {};
    expect((await callback()).status).toBe(404);
  });
});
