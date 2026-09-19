/**
 * Next.js runs `register()` once per server process, before the first
 * request. Composing here is what lets a page, a Server Action or a
 * Route Handler read a registry — plans, model prices, the request
 * context source — without each of them remembering to compose first.
 * The registries live on `globalThis`, so a bundle that duplicates
 * `lib/intelligo` still sees what this bound.
 *
 * Route Handlers keep their own `composeIntelligo()` call as well: it is
 * idempotent, and a handler invoked from a test or a worker has no
 * instrumentation hook to rely on.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { composeIntelligo, seedIntelligo } = await import("./lib/intelligo");
    composeIntelligo();
    // The first request finds the plan and billing-settings rows in
    // place. A failure is already logged, and the next request retries.
    await seedIntelligo().catch(() => undefined);
  }
}
