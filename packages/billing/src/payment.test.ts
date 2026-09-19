/**
 * The payment provider registry.
 *
 * Two properties are load-bearing and neither is obvious from the
 * types: the registry starts empty (so a production deployment that
 * wired nothing cannot silently resolve a provider), and the in-memory
 * mock — the default everywhere else — is refused in production (so a
 * restart cannot quietly discard invoices that reported success).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPaymentProviders,
  getPaymentProvider,
  mockPaymentProvider,
  registerPaymentProvider,
  registeredPaymentModes,
  type PaymentProvider,
} from "./payment";

const stub: PaymentProvider = {
  createPayment: async () => ({
    invoiceId: "inv_1",
    expiresAt: new Date(),
  }),
  checkPayment: async () => ({
    invoiceId: "inv_1",
    status: "paid" as const,
    amount: 1,
  }),
  cancelPayment: async () => {},
};

beforeEach(() => {
  clearPaymentProviders();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the registry starts empty", () => {
  it("registers nothing at import time", () => {
    // Import-side-effect registration is what this guards: importing
    // the module must not register a provider.
    expect(registeredPaymentModes()).toEqual([]);
  });

  it("refuses with the modes that do exist", () => {
    vi.stubEnv("PAYMENT_MODE", "qpay");
    expect(() => getPaymentProvider()).toThrow(/Registered: none/);

    registerPaymentProvider("stripe", stub);
    expect(() => getPaymentProvider()).toThrow(/Registered: stripe/);
    expect(() => getPaymentProvider()).toThrow(/PAYMENT_MODE="qpay"/);
  });
});

describe("resolution", () => {
  it("returns the provider registered under PAYMENT_MODE", () => {
    registerPaymentProvider("stripe", stub);
    vi.stubEnv("PAYMENT_MODE", "stripe");
    expect(getPaymentProvider()).toBe(stub);
  });

  it("defaults to the mock, unregistered, when PAYMENT_MODE is unset", () => {
    vi.stubEnv("PAYMENT_MODE", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(getPaymentProvider()).toBe(mockPaymentProvider);
    expect(registeredPaymentModes()).toEqual([]);
  });

  it("resolves the mock, unregistered, when PAYMENT_MODE names it", () => {
    vi.stubEnv("PAYMENT_MODE", "mock");
    vi.stubEnv("NODE_ENV", "test");
    expect(getPaymentProvider()).toBe(mockPaymentProvider);
  });

  it("prefers a provider the composition root registered as mock", () => {
    registerPaymentProvider("mock", stub);
    vi.stubEnv("PAYMENT_MODE", "mock");
    vi.stubEnv("NODE_ENV", "development");
    expect(getPaymentProvider()).toBe(stub);
  });

  it("refuses the unregistered mock in production", () => {
    vi.stubEnv("PAYMENT_MODE", undefined);
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getPaymentProvider()).toThrow(/mock in production/);
  });

  it("refuses the in-memory mock in production", () => {
    registerPaymentProvider("mock", mockPaymentProvider);
    vi.stubEnv("PAYMENT_MODE", "mock");
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getPaymentProvider()).toThrow(/mock in production/);
  });

  it("allows a real provider in production", () => {
    registerPaymentProvider("stripe", stub);
    vi.stubEnv("PAYMENT_MODE", "stripe");
    vi.stubEnv("NODE_ENV", "production");

    expect(getPaymentProvider()).toBe(stub);
  });

  it("forgets registrations on clear", () => {
    registerPaymentProvider("stripe", stub);
    clearPaymentProviders();
    expect(registeredPaymentModes()).toEqual([]);
  });
});
