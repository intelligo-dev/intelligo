/**
 * Where request-scoped context comes from. The framework asks for headers
 * through `getRequestHeaders()`; the application binds the source once,
 * from its composition root, so no package outside `@intelligo-dev/next`
 * depends on Next:
 *
 *     import { setRequestContextSource } from "@intelligo-dev/core/request-context";
 *     import { nextRequestContext } from "@intelligo-dev/next";
 *
 *     setRequestContextSource(nextRequestContext);
 *
 * An unbound source throws rather than guessing at the request, which is how
 * a session gets read from the wrong one.
 */

import { createRegistryRef } from "./registry";

/**
 * Produces the current request's headers.
 *
 * Async because Next's accessor is, and sync sources satisfy it too —
 * `getRequestHeaders` awaits either.
 */
export type RequestContextSource = () => Headers | Promise<Headers>;

export class RequestContextUnavailableError extends Error {
  readonly code = "request_context_unavailable";
  constructor() {
    super(
      "No request context source is bound. Call setRequestContextSource() " +
        "from your composition root — `nextRequestContext` from " +
        "@intelligo-dev/next in a Next.js app — or wrap the call in " +
        "withRequestHeaders() outside a request."
    );
    this.name = "RequestContextUnavailableError";
  }
}

/**
 * Held in the cross-instance registry, not a module variable: a bundler that
 * duplicates this module would otherwise give the composition root one copy
 * and the request path another.
 */
const source = createRegistryRef<RequestContextSource | undefined>(
  "core/request-context-source",
  undefined
);

/**
 * Headers bound by `withRequestHeaders`, visible only to the async work
 * that call started. Scoped rather than a shared slot: a slot would hand
 * one caller's cookie to every request that reads it while the call is
 * awaiting.
 */
type HeaderScope = {
  run<T>(headers: Headers, fn: () => T): T;
  getStore(): Headers | undefined;
};

const scope = createRegistryRef<HeaderScope | undefined>(
  "core/request-headers-scope",
  undefined
);

/**
 * The runtime's `AsyncLocalStorage`: the global one Next.js and edge
 * runtimes provide, or Node's own, loaded only when there is none — a
 * script, a worker or a test.
 */
async function headerScope(): Promise<HeaderScope> {
  const existing = scope.get();
  if (existing) return existing;
  const Storage =
    (globalThis as { AsyncLocalStorage?: new () => HeaderScope })
      .AsyncLocalStorage ??
    (await import("node:async_hooks")).AsyncLocalStorage;
  const created = new Storage() as HeaderScope;
  scope.set(created);
  return created;
}

export function setRequestContextSource(next: RequestContextSource): void {
  source.set(next);
}

/** Forget the bound source. For tests composing a fresh root. */
export function clearRequestContextSource(): void {
  source.set(undefined);
}

export function hasRequestContextSource(): boolean {
  return source.get() !== undefined || scope.get()?.getStore() !== undefined;
}

/**
 * The current request's headers.
 *
 * @throws {RequestContextUnavailableError} when nothing is bound.
 */
export async function getRequestHeaders(): Promise<Headers> {
  const explicit = scope.get()?.getStore();
  if (explicit) return explicit;

  const resolve = source.get();
  if (!resolve) throw new RequestContextUnavailableError();
  return await resolve();
}

/**
 * Validates a client-sent time zone. The value comes from the browser and
 * reaches SQL (`AT TIME ZONE`) and `Intl`, so anything this runtime does not
 * know as a zone, or no value at all, becomes `UTC`.
 */
export function resolveTimeZone(value: string | null | undefined): string {
  if (!value) return "UTC";
  try {
    // Throws RangeError for anything that is not a zone it knows.
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

/**
 * Runs `fn` with these headers, whatever the ambient source says — for a
 * background job, a script acting as a user, or an integration test.
 * Only `fn` and the work it starts see them; a concurrent request keeps
 * its own. Nesting works: the innermost call wins.
 */
export async function withRequestHeaders<T>(
  headers: Headers,
  fn: () => Promise<T> | T
): Promise<T> {
  const storage = await headerScope();
  return await storage.run(headers, async () => await fn());
}
