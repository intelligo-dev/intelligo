/**
 * Which origins Better-Auth's CSRF check accepts. Kept out of `server.ts`,
 * which reaches the database and email provider at module load, so the rule
 * can be tested alone.
 */

/**
 * Resolve the trusted-origin list from the environment.
 *
 * `NEXT_PUBLIC_APP_URL` is a required variable, and when it is set it
 * is the only origin trusted — in every environment.
 *
 * When it is unset, outside production any loopback port is trusted, so a
 * fresh checkout works on whatever port Next picked (a guessed port would
 * reject every sign-in with `403 INVALID_ORIGIN`). In production nothing is
 * trusted: an unset variable there is a configuration error, and it fails
 * closed.
 */
export function resolveTrustedOrigins(env: {
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
}): string[] {
  if (env.NEXT_PUBLIC_APP_URL) return [env.NEXT_PUBLIC_APP_URL];
  if (env.NODE_ENV === "production") return [];
  return ["http://localhost:*", "http://127.0.0.1:*"];
}
