import { afterEach, describe, expect, it, vi } from "vitest";

import {
  RequestContextUnavailableError,
  clearBackgroundTaskRunner,
  clearRequestContextSource,
  getRequestHeaders,
  hasRequestContextSource,
  runInBackground,
  setBackgroundTaskRunner,
  setRequestContextSource,
  withRequestHeaders,
} from "./request-context";

afterEach(() => {
  clearRequestContextSource();
});

describe("getRequestHeaders", () => {
  it("throws with the two lines that fix it when nothing is bound", async () => {
    // Guessing at the request is how a session gets read from the
    // wrong one, so an unbound source is loud rather than empty.
    await expect(getRequestHeaders()).rejects.toBeInstanceOf(
      RequestContextUnavailableError
    );
    await expect(getRequestHeaders()).rejects.toThrow(
      /setRequestContextSource/
    );
  });

  it("reads through the bound source on every call", async () => {
    // Not cached: the source is asked again per request, which is the
    // whole point of it being a function.
    let n = 0;
    setRequestContextSource(() => new Headers({ "x-n": String(++n) }));

    expect((await getRequestHeaders()).get("x-n")).toBe("1");
    expect((await getRequestHeaders()).get("x-n")).toBe("2");
  });

  it("accepts a synchronous source", async () => {
    setRequestContextSource(() => new Headers({ a: "1" }));
    expect((await getRequestHeaders()).get("a")).toBe("1");
  });

  it("accepts an async one", async () => {
    setRequestContextSource(async () => new Headers({ a: "2" }));
    expect((await getRequestHeaders()).get("a")).toBe("2");
  });
});

describe("withRequestHeaders", () => {
  it("serves a caller that has no ambient request", async () => {
    // A background job replaying a webhook, a script acting as a user,
    // an integration test that wants a real session without a server.
    const seen = await withRequestHeaders(new Headers({ a: "explicit" }), () =>
      getRequestHeaders()
    );
    expect(seen.get("a")).toBe("explicit");
  });

  it("wins over the ambient source, then restores it", async () => {
    setRequestContextSource(() => new Headers({ a: "ambient" }));

    const inner = await withRequestHeaders(new Headers({ a: "explicit" }), () =>
      getRequestHeaders()
    );
    expect(inner.get("a")).toBe("explicit");
    expect((await getRequestHeaders()).get("a")).toBe("ambient");
  });

  it("nests", async () => {
    await withRequestHeaders(new Headers({ a: "outer" }), async () => {
      await withRequestHeaders(new Headers({ a: "inner" }), async () => {
        expect((await getRequestHeaders()).get("a")).toBe("inner");
      });
      expect((await getRequestHeaders()).get("a")).toBe("outer");
    });
  });

  it("restores even when the body throws", async () => {
    setRequestContextSource(() => new Headers({ a: "ambient" }));

    await expect(
      withRequestHeaders(new Headers({ a: "explicit" }), () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect((await getRequestHeaders()).get("a")).toBe("ambient");
  });
});

describe("hasRequestContextSource", () => {
  it("reports what is bound", async () => {
    expect(hasRequestContextSource()).toBe(false);
    setRequestContextSource(() => new Headers());
    expect(hasRequestContextSource()).toBe(true);
    clearRequestContextSource();
    expect(hasRequestContextSource()).toBe(false);
  });
});

describe("withRequestHeaders under concurrency", () => {
  it("does not lend its headers to a request running at the same time", async () => {
    setRequestContextSource(() => new Headers({ a: "request-b" }));
    let release!: () => void;
    const paused = new Promise<void>((resolve) => (release = resolve));

    const job = withRequestHeaders(new Headers({ a: "job" }), async () => {
      await paused;
      return (await getRequestHeaders()).get("a");
    });
    // While the job awaits, another request reads its own headers.
    const concurrent = (await getRequestHeaders()).get("a");
    release();

    expect(concurrent).toBe("request-b");
    expect(await job).toBe("job");
  });
});

describe("withRequestHeaders on its first concurrent calls", () => {
  it("gives every caller its own headers while the storage is still being created", async () => {
    // A process with no global AsyncLocalStorage creates the storage on
    // first use; start from that state.
    const slots = globalThis as unknown as Record<
      symbol,
      { map: Map<string, unknown> } | undefined
    >;
    slots[
      Symbol.for("@intelligo-dev/registry/ref/core/request-headers-scope")
    ]!.map.set("value", undefined);

    const read = (name: string) =>
      withRequestHeaders(new Headers({ a: name }), async () =>
        (await getRequestHeaders()).get("a")
      );

    expect(await Promise.all([read("one"), read("two")])).toEqual([
      "one",
      "two",
    ]);
  });
});

describe("runInBackground", () => {
  afterEach(() => {
    clearBackgroundTaskRunner();
  });

  it("hands the task to the bound runner", async () => {
    const runner = vi.fn();
    setBackgroundTaskRunner(runner);

    runInBackground(Promise.resolve("done"));

    expect(runner).toHaveBeenCalledTimes(1);
    await expect(runner.mock.calls[0]![0]).resolves.toBeUndefined();
  });

  it("never hands the runner a rejection", async () => {
    const runner = vi.fn();
    setBackgroundTaskRunner(runner);
    const failing = Promise.reject(new Error("boom"));
    failing.catch(() => {});

    runInBackground(failing);

    await expect(runner.mock.calls[0]![0]).resolves.toBeUndefined();
  });

  it("lets the task run where the runner has no request to extend", () => {
    setBackgroundTaskRunner(() => {
      throw new Error("outside a request scope");
    });

    expect(() => runInBackground(Promise.resolve())).not.toThrow();
  });

  it("does nothing with no runner bound", () => {
    expect(() => runInBackground(Promise.resolve())).not.toThrow();
  });
});
