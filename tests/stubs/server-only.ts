/**
 * Test stub for the `server-only` package.
 *
 * The real module throws unless the bundler applies React's
 * react-server export condition; vitest's node environment does not,
 * so any test that transitively imports a server module would fail on
 * the guard rather than on anything it is testing.
 */
export {};
