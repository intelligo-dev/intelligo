/**
 * Stands in for the `server-only` package under Vitest (vitest.config.ts
 * aliases it here). The real module throws outside a `react-server`
 * build, which would fail every test that imports server code on the
 * guard instead of on what it tests.
 */
export {};
