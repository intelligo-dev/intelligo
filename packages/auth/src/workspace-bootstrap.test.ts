import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearBackgroundTaskRunner,
  setBackgroundTaskRunner,
} from "@intelligo-dev/core/request-context";

import { workspaceCreated } from "./workspace-bootstrap";

const created = { workspaceId: "ws-1", userId: "u-1", email: "a@b.test" };

afterEach(() => {
  clearBackgroundTaskRunner();
});

describe("workspaceCreated", () => {
  it("hands the bootstrap to the background runner so it outlives the response", async () => {
    const runner = vi.fn();
    setBackgroundTaskRunner(runner);
    let finish!: () => void;
    const handler = vi.fn(
      () => new Promise<void>((resolve) => (finish = resolve))
    );

    workspaceCreated(created, handler);

    expect(handler).toHaveBeenCalledWith(created);
    expect(runner).toHaveBeenCalledTimes(1);
    finish();
    await expect(runner.mock.calls[0]![0]).resolves.toBeUndefined();
  });

  it("does not reject when the bootstrap fails", async () => {
    const runner = vi.fn();
    setBackgroundTaskRunner(runner);

    workspaceCreated(created, () => Promise.reject(new Error("down")));

    await expect(runner.mock.calls[0]![0]).resolves.toBeUndefined();
  });

  it("does nothing without a handler", () => {
    const runner = vi.fn();
    setBackgroundTaskRunner(runner);

    workspaceCreated(created, null);

    expect(runner).not.toHaveBeenCalled();
  });
});
