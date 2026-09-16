/**
 * Where request-scoped context comes from.
 *
 * `@intelligo-dev/auth` needs the incoming request's headers to resolve
 * a session, and it got them by importing `next/headers` directly in
 * five files. That made a package whose subject is authentication —
 * not rendering — unusable outside Next: a queue worker that wants to
 * check a session, a Hono API, a product on another framework, a test
 * that is not running inside a request. ADR-0005 named the fix in its
 * consequences; this is it.
 *
 * The framework asks for headers through `getRequestHeaders()`. The
 * application says where they come from, once, from its composition
 * root:
 *
 *     import { setRequestContextSource } from "@intelligo-dev/core/request-context";
 *     import { nextRequestContext } from "@intelligo-dev/next";
 *
 *     setRequestContextSource(nextRequestContext);
 *
 * `@intelligo-dev/next` is the only package in the framework that
 * imports `next/*`, and an architecture test keeps it that way. This
 * module imports nothing but `./registry`, so the contract is reachable
 * from any runtime the adapter is not.
 *
 * Nothing self-registers. An unbound source throws where the headers
 * are needed, naming the two lines that fix it — the alternative is a
 * framework that guesses at the request, which is how a session gets
 * read from the wrong one.
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
 * Held in the cross-instance registry rather than a module variable
 * for the same reason every other framework registry is: a bundler
 * that duplicates this module would otherwise give the composition
 * root one copy and the request path another.
 */
const source = createRegistryRef<RequestContextSource | undefined>(
  "core/request-context-source",
  undefined
);

/** Explicitly bound headers, for a call that is not inside a request. */
const override = createRegistryRef<Headers | undefined>(
  "core/request-headers-override",
  undefined
);

export function setRequestContextSource(next: RequestContextSource): void {
  source.set(next);
}

/** Forget the bound source. For tests composing a fresh root. */
export function clearRequestContextSource(): void {
  source.set(undefined);
  override.set(undefined);
}

export function hasRequestContextSource(): boolean {
  return source.get() !== undefined || override.get() !== undefined;
}

/**
 * The current request's headers.
 *
 * @throws {RequestContextUnavailableError} when nothing is bound.
 */
export async function getRequestHeaders(): Promise<Headers> {
  const explicit = override.get();
  if (explicit) return explicit;

  const resolve = source.get();
  if (!resolve) throw new RequestContextUnavailableError();
  return await resolve();
}

/**
 * A time zone the caller can be trusted with, from a value they sent.
 *
 * The reader's zone arrives from the browser — a cookie an app writes
 * from `Intl.DateTimeFormat().resolvedOptions()` — so it is input, not
 * configuration: it reaches SQL (`AT TIME ZONE`) and `Intl`, both of
 * which take a string. Anything that is not a zone this runtime knows
 * becomes `UTC`, which is also the honest default when a request
 * carries no zone at all: a server has no business guessing where
 * someone is sitting.
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
 * Run `fn` with these headers, whatever the ambient source says.
 *
 * For the callers that have a request but are not inside the
 * framework's request scope: a background job replaying a webhook, a
 * script acting as a user, an integration test that wants a real
 * session without a server. Restores the previous value afterwards, so
 * nesting behaves.
 *
 * Not `AsyncLocalStorage`: the value is set and restored around one
 * awaited call, and ALS would make the package require a Node built-in
 * that Edge runtimes only partly provide.
 */
export async function withRequestHeaders<T>(
  headers: Headers,
  fn: () => Promise<T> | T
): Promise<T> {
  const previous = override.get();
  override.set(headers);
  try {
    return await fn();
  } finally {
    override.set(previous);
  }
}
