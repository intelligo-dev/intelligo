/**
 * Onboarding service unit tests.
 *
 * Mocks `../helpers` (requireAuth) and `@intelligo/core/db`'s
 * select/update chain — the same seam
 * `the product application/actions/__tests__/onboarding.test.ts` mocked for the
 * server action this service replaces. Focused on state reads, step
 * validation, complete/skip's shared effect, and
 * OnboardingServiceError codes.
 *
 * index.ts's exports for this module are not wired up yet (see the
 * migration task), so this test imports `./service` and `./errors`
 * directly rather than through the package root.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above the file's static imports, so
// anything they reference must be born inside vi.hoisted.
const mocks = vi.hoisted(() => {
  const requireAuth = vi.fn();

  const selectLimit = vi.fn();
  const selectWhere = vi.fn();
  const selectFrom = vi.fn();
  const select = vi.fn();

  const updateWhere = vi.fn();
  const updateSet = vi.fn();
  const update = vi.fn();

  return {
    requireAuth,
    selectLimit,
    selectWhere,
    selectFrom,
    select,
    updateWhere,
    updateSet,
    update,
  };
});

vi.mock("../helpers", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("@intelligo/core/db", () => ({
  db: { select: mocks.select, update: mocks.update },
}));

vi.mock("@intelligo/core/db/schema", () => ({
  users: {
    id: "id",
    onboardingCompleted: "onboardingCompleted",
    onboardingStep: "onboardingStep",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

import { createOnboardingService } from "./service";
import { isOnboardingServiceError } from "./errors";

const fakeUser = { id: "u-1", email: "u@example.com" };

beforeEach(() => {
  vi.resetAllMocks();

  mocks.requireAuth.mockResolvedValue({ user: fakeUser });

  mocks.selectLimit.mockResolvedValue([
    { onboardingCompleted: false, onboardingStep: null },
  ]);
  mocks.selectWhere.mockReturnValue({ limit: mocks.selectLimit });
  mocks.selectFrom.mockReturnValue({ where: mocks.selectWhere });
  mocks.select.mockReturnValue({ from: mocks.selectFrom });

  mocks.updateWhere.mockResolvedValue([]);
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.update.mockReturnValue({ set: mocks.updateSet });
});

// ---------------------------------------------------------------------------
// getState
// ---------------------------------------------------------------------------

describe("getState", () => {
  it("returns the caller's onboarding state", async () => {
    mocks.selectLimit.mockResolvedValue([
      { onboardingCompleted: false, onboardingStep: "profile" },
    ]);
    const service = createOnboardingService();

    const result = await service.getState();

    expect(result).toEqual({ completed: false, currentStep: "profile" });
  });

  it("throws not_found when no user row exists", async () => {
    mocks.selectLimit.mockResolvedValue([]);
    const service = createOnboardingService();

    const err = await service.getState().catch((e) => e);

    expect(isOnboardingServiceError(err)).toBe(true);
    expect(err.code).toBe("not_found");
  });

  it("throws a forbidden OnboardingServiceError when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createOnboardingService();

    const err = await service.getState().catch((e) => e);

    expect(isOnboardingServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// setStep
// ---------------------------------------------------------------------------

describe("setStep", () => {
  it("persists an arbitrary, product-defined step id", async () => {
    const service = createOnboardingService();

    const result = await service.setStep("preferences");

    expect(mocks.update).toHaveBeenCalled();
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingStep: "preferences" })
    );
    expect(result).toEqual({ completed: false, currentStep: "preferences" });
  });

  it("trims whitespace before persisting", async () => {
    const service = createOnboardingService();

    await service.setStep("  role  ");

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingStep: "role" })
    );
  });

  it("throws invalid_input for an empty step and never updates", async () => {
    const service = createOnboardingService();

    const err = await service.setStep("").catch((e) => e);

    expect(isOnboardingServiceError(err)).toBe(true);
    expect(err.code).toBe("invalid_input");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("throws invalid_input for a step id over 64 characters", async () => {
    const service = createOnboardingService();

    const err = await service.setStep("x".repeat(65)).catch((e) => e);

    expect(isOnboardingServiceError(err)).toBe(true);
    expect(err.code).toBe("invalid_input");
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("throws forbidden when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createOnboardingService();

    const err = await service.setStep("role").catch((e) => e);

    expect(isOnboardingServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
  });
});

// ---------------------------------------------------------------------------
// complete
// ---------------------------------------------------------------------------

describe("complete", () => {
  it("marks onboarding complete and clears the step", async () => {
    const service = createOnboardingService();

    const result = await service.complete();

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingCompleted: true,
        onboardingStep: null,
      })
    );
    expect(result).toEqual({ completed: true, currentStep: null });
  });

  it("throws forbidden when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createOnboardingService();

    const err = await service.complete().catch((e) => e);

    expect(isOnboardingServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// skip
// ---------------------------------------------------------------------------

describe("skip", () => {
  it("has the same durable effect as complete", async () => {
    const service = createOnboardingService();

    const result = await service.skip();

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        onboardingCompleted: true,
        onboardingStep: null,
      })
    );
    expect(result).toEqual({ completed: true, currentStep: null });
  });

  it("throws forbidden when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createOnboardingService();

    const err = await service.skip().catch((e) => e);

    expect(isOnboardingServiceError(err)).toBe(true);
    expect(err.code).toBe("forbidden");
  });
});
