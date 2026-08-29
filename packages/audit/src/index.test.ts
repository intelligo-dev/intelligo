/**
 * Audit tests — the failure-tolerance contract.
 *
 * `recordAuditEvent` must never throw: an audit write failing has to
 * be visible in logs without taking down the operation it describes.
 * `recordAuditEventOrThrow` is the opposite guarantee, for the cases
 * (impersonation, destructive support actions) where an unrecorded
 * action must not happen at all.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@intelligo-dev/core/db", () => ({
  db: { insert: mocks.insert },
}));

vi.mock("@intelligo-dev/core/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("./db/schema", () => ({
  auditEvents: {
    id: "id",
    workspaceId: "workspaceId",
    action: "action",
    createdAt: "createdAt",
    resourceKind: "resourceKind",
    resourceId: "resourceId",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args: unknown[]) => ({ op: "and", args })),
  desc: vi.fn((col: unknown) => ({ op: "desc", col })),
  eq: vi.fn((col: unknown, val: unknown) => ({ op: "eq", col, val })),
  lt: vi.fn((col: unknown, val: unknown) => ({ op: "lt", col, val })),
}));

import { recordAuditEvent, recordAuditEventOrThrow } from "./index";

function row() {
  return mocks.insertValues.mock.calls[0]![0]! as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
  mocks.insertValues.mockResolvedValue(undefined);
});

describe("recordAuditEvent", () => {
  it("writes the event with sensible defaults", async () => {
    await recordAuditEvent({
      workspaceId: "ws-1",
      actorId: "u-1",
      action: "execution.completed",
      resourceKind: "execution",
      resourceId: "e-1",
      metadata: { requestId: "req-1" },
    });

    expect(row()).toMatchObject({
      workspaceId: "ws-1",
      actorId: "u-1",
      actorKind: "user",
      action: "execution.completed",
      resourceKind: "execution",
      resourceId: "e-1",
      outcome: "ok",
      metadata: { requestId: "req-1" },
    });
    expect(row().id).toBeTruthy();
  });

  it("infers a system actor when no actorId is given", async () => {
    await recordAuditEvent({ action: "jobs.pruned", resourceKind: "job" });

    expect(row()).toMatchObject({
      actorKind: "system",
      actorId: null,
      workspaceId: null,
    });
  });

  it("respects an explicit actorKind and outcome", async () => {
    await recordAuditEvent({
      actorId: "u-9",
      actorKind: "support",
      action: "workspace.impersonated",
      resourceKind: "workspace",
      outcome: "failed",
    });

    expect(row()).toMatchObject({ actorKind: "support", outcome: "failed" });
  });

  it("swallows write failures — auditing must not break the audited action", async () => {
    mocks.insertValues.mockRejectedValue(new Error("db down"));

    await expect(
      recordAuditEvent({
        action: "execution.failed",
        resourceKind: "execution",
      })
    ).resolves.toBeUndefined();
  });
});

describe("recordAuditEventOrThrow", () => {
  it("propagates write failures", async () => {
    mocks.insertValues.mockRejectedValue(new Error("db down"));

    await expect(
      recordAuditEventOrThrow({
        action: "workspace.impersonated",
        resourceKind: "workspace",
      })
    ).rejects.toThrow("db down");
  });
});
