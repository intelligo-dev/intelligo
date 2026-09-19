/**
 * The page's credit read: one estimate per model, and never a throw.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getChatQuotaState, getChatQuotaStates } from "./quota";

const mocks = vi.hoisted(() => ({
  requireWorkspace: vi.fn(),
  estimateQuota: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock("@intelligo-dev/auth", () => ({
  requireWorkspace: mocks.requireWorkspace,
}));
vi.mock("@intelligo-dev/billing", () => ({
  estimateQuota: mocks.estimateQuota,
}));
vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: mocks.logWarn,
    error: mocks.logError,
  }),
}));

const USD = (amount: number) => ({ amount, currency: "USD" });

function allowed(estimated: number) {
  return {
    allowed: true,
    billingMode: "subscription",
    usage: { used: 0, limit: 0, percentage: 0 },
    remaining: USD(500_000),
    estimated: USD(estimated),
    usingTrialCredits: false,
    graceActive: false,
  };
}

beforeEach(() => {
  mocks.requireWorkspace.mockResolvedValue({ workspace: { id: "ws-1" } });
});

afterEach(() => vi.clearAllMocks());

describe("getChatQuotaState", () => {
  it("prices the estimate against the model it was asked about", async () => {
    mocks.estimateQuota.mockResolvedValue(allowed(100_000));
    const state = await getChatQuotaState({
      modelId: "google/gemini-2.5-flash",
      upgradeHref: "/pricing",
    });
    expect(mocks.estimateQuota).toHaveBeenCalledWith("ws-1", {
      modelId: "google/gemini-2.5-flash",
    });
    expect(state).toEqual({
      allowed: true,
      reason: null,
      code: null,
      remaining: 500_000,
      estimated: 100_000,
      upgradeHref: "/pricing",
    });
  });

  it("answers null rather than throwing", async () => {
    mocks.estimateQuota.mockRejectedValue(new Error("db down"));
    expect(
      await getChatQuotaState({ modelId: "m", upgradeHref: "/pricing" })
    ).toBeNull();
    expect(mocks.logWarn).toHaveBeenCalled();
  });

  it("logs an unregistered model as an error, with its id", async () => {
    mocks.estimateQuota.mockResolvedValue({
      ...allowed(0),
      allowed: false,
      code: "unknown_model",
      reason: 'Model "acme/ghost" is not registered.',
    });
    const state = await getChatQuotaState({
      modelId: "acme/ghost",
      upgradeHref: "/pricing",
    });
    expect(state?.code).toBe("unknown_model");
    expect(mocks.logError).toHaveBeenCalledWith(
      "Model has no registered price",
      expect.objectContaining({ modelId: "acme/ghost" })
    );
  });
});

describe("getChatQuotaStates", () => {
  it("reads one estimate per distinct model, keyed by id", async () => {
    mocks.estimateQuota.mockImplementation(
      async (_workspaceId: string, { modelId }: { modelId: string }) =>
        allowed(modelId === "dear" ? 672_000 : 100_000)
    );
    const states = await getChatQuotaStates({
      modelIds: ["cheap", "dear", "cheap"],
      upgradeHref: "/pricing",
    });
    expect(mocks.requireWorkspace).toHaveBeenCalledTimes(1);
    expect(mocks.estimateQuota).toHaveBeenCalledTimes(2);
    expect(states.cheap?.estimated).toBe(100_000);
    expect(states.dear?.estimated).toBe(672_000);
  });

  it("reads nothing for an empty list", async () => {
    expect(
      await getChatQuotaStates({ modelIds: [], upgradeHref: "/pricing" })
    ).toEqual({});
    expect(mocks.requireWorkspace).not.toHaveBeenCalled();
    expect(mocks.estimateQuota).not.toHaveBeenCalled();
  });

  it("leaves out a model whose read failed and keeps the rest", async () => {
    mocks.estimateQuota.mockImplementation(
      async (_workspaceId: string, { modelId }: { modelId: string }) => {
        if (modelId === "broken") throw new Error("db down");
        return allowed(100_000);
      }
    );
    const states = await getChatQuotaStates({
      modelIds: ["ok", "broken"],
      upgradeHref: "/pricing",
    });
    expect(Object.keys(states)).toEqual(["ok"]);
  });

  it("answers empty when there is no workspace to read", async () => {
    mocks.requireWorkspace.mockRejectedValue(new Error("no session"));
    expect(
      await getChatQuotaStates({ modelIds: ["ok"], upgradeHref: "/pricing" })
    ).toEqual({});
  });
});
