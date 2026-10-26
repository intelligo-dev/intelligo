import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ insertValues: vi.fn() }));

vi.mock("../db", () => ({
  db: {
    insert: () => ({
      values: (row: unknown) => {
        mocks.insertValues(row);
        return { returning: async () => [{ id: "n-1", ...(row as object) }] };
      },
    }),
  },
}));
vi.mock("../db/schema", () => ({ notifications: {} }));

import { createNotification } from "./index";

const base = {
  userId: "user-1",
  workspaceId: "ws-1",
  type: "system",
  title: "Title",
  message: "Message",
} as const;

describe("createNotification", () => {
  beforeEach(() => mocks.insertValues.mockClear());

  it("stores metadata as JSON text and returns it parsed", async () => {
    const metadata = { href: "/chat?query=next", count: 2 };
    const created = await createNotification({ ...base, metadata });
    expect(mocks.insertValues.mock.calls[0]![0].metadata).toBe(
      JSON.stringify(metadata)
    );
    expect(created.metadata).toEqual(metadata);
  });

  it("returns null metadata when none is given", async () => {
    const created = await createNotification(base);
    expect(created.metadata).toBeNull();
  });
});
