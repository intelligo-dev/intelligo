/**
 * Mocks `../helpers` (requireAuth), `../server` (auth.api.updateUser),
 * and `@intelligo-dev/core/db` (the soft-delete + session-wipe queries).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above the file's static imports, so
// anything they reference must be born inside vi.hoisted (see
// helpers.test.ts for the same note).
const mocks = vi.hoisted(() => {
  const requireAuth = vi.fn();
  const headersMock = vi.fn(async () => new Headers());
  const updateUser = vi.fn();

  const updateSetWhereMock = vi.fn();
  const deleteWhereMock = vi.fn();

  return {
    requireAuth,
    headersMock,
    updateUser,
    updateSetWhereMock,
    deleteWhereMock,
  };
});

vi.mock("@intelligo-dev/core/request-context", () => ({
  getRequestHeaders: mocks.headersMock,
}));

vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: {
    update: () => ({
      set: (values: unknown) => ({
        where: async (...args: unknown[]) =>
          mocks.updateSetWhereMock(values, ...args),
      }),
    }),
    delete: () => ({
      where: async (...args: unknown[]) => mocks.deleteWhereMock(...args),
    }),
  },
}));

vi.mock("@intelligo-dev/core/db/schema", () => ({
  users: { id: "id" },
  sessions: { userId: "userId" },
}));

vi.mock("../helpers", () => ({
  requireAuth: mocks.requireAuth,
}));

vi.mock("../server", () => ({
  auth: {
    api: {
      updateUser: mocks.updateUser,
    },
  },
}));

import { createProfileService } from "./service";
import { isProfileServiceError } from "./errors";

const baseUser = {
  id: "u-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  image: null as string | null,
  emailVerified: true,
};

beforeEach(() => {
  vi.resetAllMocks();

  mocks.headersMock.mockImplementation(async () => new Headers());
  mocks.requireAuth.mockResolvedValue({ user: baseUser });
  mocks.updateUser.mockResolvedValue({});
  mocks.updateSetWhereMock.mockResolvedValue(undefined);
  mocks.deleteWhereMock.mockResolvedValue(undefined);
});

describe("getProfile", () => {
  it("returns the caller's profile", async () => {
    const service = createProfileService();

    await expect(service.getProfile()).resolves.toEqual({
      id: "u-1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
      emailVerified: true,
    });
  });

  it("defaults a null name/image and coerces emailVerified", async () => {
    mocks.requireAuth.mockResolvedValue({
      user: {
        ...baseUser,
        name: null,
        image: undefined,
        emailVerified: undefined,
      },
    });
    const service = createProfileService();

    await expect(service.getProfile()).resolves.toMatchObject({
      name: null,
      image: null,
      emailVerified: false,
    });
  });

  it("throws a forbidden ProfileServiceError when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createProfileService();

    await expect(service.getProfile()).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("updateProfile", () => {
  it("calls auth.api.updateUser with only the provided fields", async () => {
    const service = createProfileService();

    await service.updateProfile({ name: "New Name" });

    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.updateUser).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { name: "New Name" },
    });
  });

  it("forwards image when a non-null URL is provided", async () => {
    const service = createProfileService();

    await service.updateProfile({
      name: "New Name",
      image: "https://example.com/avatar.png",
    });

    expect(mocks.updateUser).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: { name: "New Name", image: "https://example.com/avatar.png" },
    });
  });

  it("drops a null image rather than forwarding it", async () => {
    const service = createProfileService();

    await service.updateProfile({ image: null });

    expect(mocks.updateUser).toHaveBeenCalledWith({
      headers: expect.any(Headers),
      body: {},
    });
  });

  it("throws invalid_input and never calls updateUser for a bad name", async () => {
    const service = createProfileService();

    await expect(service.updateProfile({ name: "a" })).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("wraps an updateUser failure as provider_error", async () => {
    mocks.updateUser.mockRejectedValue(new Error("Better-Auth is down"));
    const service = createProfileService();

    await expect(
      service.updateProfile({ name: "New Name" })
    ).rejects.toMatchObject({ code: "provider_error" });
  });

  it("throws a forbidden ProfileServiceError when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createProfileService();

    await expect(
      service.updateProfile({ name: "New Name" })
    ).rejects.toMatchObject({ code: "forbidden" });
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
});

describe("deleteAccount", () => {
  it("soft-deletes the user and invalidates every session", async () => {
    const service = createProfileService();

    await service.deleteAccount();

    expect(mocks.updateSetWhereMock).toHaveBeenCalledTimes(1);
    const [values] = mocks.updateSetWhereMock.mock.calls[0]!;
    expect(values).toMatchObject({ deletedAt: expect.any(Date) });

    expect(mocks.deleteWhereMock).toHaveBeenCalledTimes(1);
  });

  it("works without an onAccountDeleted port bound", async () => {
    const service = createProfileService();

    await expect(service.deleteAccount()).resolves.toBeUndefined();
  });

  it("fires the onAccountDeleted port without waiting on it", async () => {
    const onAccountDeleted = vi.fn().mockResolvedValue(undefined);
    const service = createProfileService({ onAccountDeleted });

    await service.deleteAccount();

    expect(onAccountDeleted).toHaveBeenCalledWith({
      userId: "u-1",
      email: "ada@example.com",
      name: "Ada Lovelace",
    });
  });

  it("does not reject deleteAccount when the onAccountDeleted port fails", async () => {
    const onAccountDeleted = vi.fn().mockRejectedValue(new Error("SMTP down"));
    const service = createProfileService({ onAccountDeleted });

    await expect(service.deleteAccount()).resolves.toBeUndefined();
  });

  it("wraps a soft-delete failure as provider_error and skips the port", async () => {
    mocks.updateSetWhereMock.mockRejectedValue(new Error("db down"));
    const onAccountDeleted = vi.fn();
    const service = createProfileService({ onAccountDeleted });

    await expect(service.deleteAccount()).rejects.toMatchObject({
      code: "provider_error",
    });
    expect(onAccountDeleted).not.toHaveBeenCalled();
  });

  it("throws a forbidden ProfileServiceError when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createProfileService();

    await expect(service.deleteAccount()).rejects.toMatchObject({
      code: "forbidden",
    });
    expect(mocks.updateSetWhereMock).not.toHaveBeenCalled();
  });
});

describe("setPreferredLanguage", () => {
  it("records a language tag on the caller's own row", async () => {
    const service = createProfileService();

    await service.setPreferredLanguage("mn");

    const [values] = mocks.updateSetWhereMock.mock.calls[0]!;
    expect(values).toMatchObject({ preferredLanguage: "mn" });
  });

  it("refuses something that is not a language tag", async () => {
    const service = createProfileService();

    await expect(service.setPreferredLanguage("mn; drop")).rejects.toMatchObject(
      { code: "invalid_input" }
    );
    expect(mocks.updateSetWhereMock).not.toHaveBeenCalled();
  });

  it("throws a forbidden ProfileServiceError when unauthenticated", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createProfileService();

    await expect(service.setPreferredLanguage("en")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("isProfileServiceError", () => {
  it("narrows only ProfileServiceError instances", async () => {
    mocks.requireAuth.mockRejectedValue(new Error("Unauthorized"));
    const service = createProfileService();

    try {
      await service.getProfile();
      throw new Error("expected getProfile to throw");
    } catch (error) {
      expect(isProfileServiceError(error)).toBe(true);
    }

    expect(isProfileServiceError(new Error("plain"))).toBe(false);
  });
});
