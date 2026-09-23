/**
 * Payment provider contract and registry.
 *
 * The interface and an in-memory mock live here; real providers are
 * registered by the application's composition root. PAYMENT_MODE
 * selects among registered providers. "mock" is the default: outside
 * production it resolves to the in-memory mock with no registration,
 * and in production it is refused.
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
  /** Minor units, as `createPayment`'s `amount`. */
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

/** Simulate a successful payment (dev only). */
export function mockCompletePayment(invoiceId: string): boolean {
  const payment = mockPayments.get(invoiceId);
  if (!payment || payment.status !== "pending") return false;
  payment.status = "paid";
  return true;
}

/** Get mock payment data (dev only). */
export function getMockPayment(invoiceId: string) {
  return mockPayments.get(invoiceId) ?? null;
}

// ─── Provider Registry ───

/**
 * Starts empty on purpose: the composition root is the only way a real
 * provider exists, so a production deployment that wired nothing cannot
 * silently resolve one.
 */
const providers = createRegistry<PaymentProvider>("billing/payment-providers");

/**
 * Register a payment provider under the name PAYMENT_MODE will select.
 * Called from the composition root.
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

/** The PAYMENT_MODE this process runs under; "mock" when unset. */
export function currentPaymentMode(): string {
  return process.env.PAYMENT_MODE ?? "mock";
}

/**
 * Resolve the configured provider.
 *
 * PAYMENT_MODE unset means "mock". Outside production that mode needs no
 * registration: it resolves to `mockPaymentProvider`, unless the
 * composition root registered its own provider under "mock".
 *
 * @throws when PAYMENT_MODE names something unregistered, or when it
 * resolves to the in-memory mock in production — mock payments are
 * held in a Map that a restart empties, so silently using it in
 * production would report successful payments that never happened.
 */
export function getPaymentProvider(): PaymentProvider {
  return getPaymentProviderFor(currentPaymentMode());
}

/**
 * Resolve the provider registered under `mode`, by the same rules as
 * `getPaymentProvider`. An invoice is settled by the provider that
 * issued it, which is not necessarily the one PAYMENT_MODE names now.
 */
export function getPaymentProviderFor(mode: string): PaymentProvider {
  if (mode === "mock" && process.env.NODE_ENV === "production") {
    throw new Error(
      "PAYMENT_MODE=mock in production. The mock provider keeps invoices " +
        "in memory and loses them on restart. Register a real provider " +
        "from the composition root and set PAYMENT_MODE to its name."
    );
  }

  const provider =
    providers.get(mode) ?? (mode === "mock" ? mockPaymentProvider : undefined);
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
