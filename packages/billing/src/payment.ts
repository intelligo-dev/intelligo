/**
 * Payment provider contract and registry.
 *
 * The interface and an in-memory mock live here; real providers are
 * registered by the application's composition root (ADR-0005) and, if
 * they are market-specific, live in a private package (ADR-0006).
 *
 * Until Phase 3 this file also carried QPay and SocialPay
 * implementations. Both threw on every method, so a public package
 * named two Mongolian payment rails and shipped nothing that worked;
 * `PAYMENT_MODE=qpay` in production would have failed every payment.
 * Removing them changes no behaviour — an unregistered mode now fails
 * with a message that says which providers exist.
 *
 * PAYMENT_MODE selects among registered providers; "mock" is the
 * default and is refused in production.
 */

import { createRegistry } from "@intelligo-dev/core/registry";

export type PaymentStatus = "pending" | "paid" | "expired" | "failed";

export interface CreatePaymentResult {
  invoiceId: string;
  qrCode?: string; // QR code image URL/data, where the provider issues one
  deeplinks?: { app: string; url: string }[]; // Payment app deeplinks
  expiresAt: Date;
}

export interface PaymentCheckResult {
  invoiceId: string;
  status: PaymentStatus;
  paidAt?: Date;
  amount: number;
}

export interface PaymentProvider {
  createPayment(params: {
    amount: number; // Minor units of the provider's own currency
    description: string;
    userId: string;
    planSlug: string;
  }): Promise<CreatePaymentResult>;

  checkPayment(invoiceId: string): Promise<PaymentCheckResult>;

  cancelPayment(invoiceId: string): Promise<void>;
}

// ─── Mock Provider (Development) ───

const mockPayments = createRegistry<{
  status: PaymentStatus;
  amount: number;
  userId: string;
  planSlug: string;
  createdAt: Date;
}>("billing/mock-payments");

export const mockPaymentProvider: PaymentProvider = {
  async createPayment({ amount, description: _description, userId, planSlug }) {
    const invoiceId = `mock_${crypto.randomUUID().slice(0, 8)}`;
    mockPayments.set(invoiceId, {
      status: "pending",
      amount,
      userId,
      planSlug,
      createdAt: new Date(),
    });
    return {
      invoiceId,
      qrCode: `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="%23111"/><text x="50%" y="50%" fill="white" text-anchor="middle" dy=".3em" font-size="14">MOCK QR</text></svg>`,
      deeplinks: [{ app: "Mock Payment App", url: `mock://pay/${invoiceId}` }],
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
    };
  },

  async checkPayment(invoiceId) {
    const payment = mockPayments.get(invoiceId);
    if (!payment) {
      return { invoiceId, status: "expired" as PaymentStatus, amount: 0 };
    }
    return {
      invoiceId,
      status: payment.status,
      amount: payment.amount,
    };
  },

  async cancelPayment(invoiceId) {
    const payment = mockPayments.get(invoiceId);
    if (payment) {
      payment.status = "expired";
    }
  },
};

/**
 * Simulate payment completion (dev only)
 * Call this to mock a successful payment
 */
export function mockCompletePayment(invoiceId: string): boolean {
  const payment = mockPayments.get(invoiceId);
  if (!payment || payment.status !== "pending") return false;
  payment.status = "paid";
  return true;
}

/**
 * Get mock payment data (dev only)
 */
export function getMockPayment(invoiceId: string) {
  return mockPayments.get(invoiceId) ?? null;
}

// ─── Provider Registry ───

/**
 * Starts empty on purpose.
 *
 * It used to be seeded with `["mock", mockPaymentProvider]` at module
 * scope, which is import-side-effect registration (ADR-0005) wearing a
 * different hat: importing this file registered a provider, so a
 * deployment that wired nothing still resolved one, and
 * `registerPaymentProvider` had no caller anywhere in the repository
 * without that being visible. An empty registry makes the composition
 * root the only way a provider exists.
 */
const providers = createRegistry<PaymentProvider>("billing/payment-providers");

/**
 * Register a payment provider under the name PAYMENT_MODE will select.
 * Called from the composition root; a market-specific implementation
 * belongs in a private package.
 */
export function registerPaymentProvider(
  mode: string,
  provider: PaymentProvider
): void {
  providers.set(mode, provider);
}

export function registeredPaymentModes(): string[] {
  return [...providers.keys()];
}

/** Drop every registration. For tests composing a fresh root. */
export function clearPaymentProviders(): void {
  providers.clear();
}

/**
 * Resolve the configured provider.
 *
 * @throws when PAYMENT_MODE names something unregistered, or when it
 * resolves to the in-memory mock in production — mock payments are
 * held in a Map that a restart empties, so silently using it in
 * production would report successful payments that never happened.
 */
export function getPaymentProvider(): PaymentProvider {
  const mode = process.env.PAYMENT_MODE ?? "mock";

  if (mode === "mock" && process.env.NODE_ENV === "production") {
    throw new Error(
      "PAYMENT_MODE=mock in production. The mock provider keeps invoices " +
        "in memory and loses them on restart. Register a real provider " +
        "from the composition root and set PAYMENT_MODE to its name."
    );
  }

  const provider = providers.get(mode);
  if (!provider) {
    const registered = registeredPaymentModes();
    throw new Error(
      `No payment provider registered for PAYMENT_MODE="${mode}". ` +
        `Registered: ${registered.length > 0 ? registered.join(", ") : "none"}. ` +
        `Register one with registerPaymentProvider() from the composition root.`
    );
  }
  return provider;
}
