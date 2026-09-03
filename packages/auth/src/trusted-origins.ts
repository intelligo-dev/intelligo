/**
 * Which origins Better-Auth's CSRF check accepts.
 *
 * Split out of `server.ts` so the rule can be tested without standing
 * up the whole auth instance (which reaches the database and the email
 * provider at module load).
 */

/**
 * Resolve the trusted-origin list from the environment.
 *
 * `NEXT_PUBLIC_APP_URL` is a required variable, and when it is set it
 * is the only origin trusted — in every environment.
 *
 * When it is unset the answer depends on where we are. A guessed port
 * is the worst possible default: the reference app serves on 4002, a
 * scaffolded app on 3000, so a fixed guess rejects every sign-in with
 * `403 INVALID_ORIGIN` while the log names only the rejected origin —
 * nothing points back at the missing variable. Outside production we
 * therefore trust any loopback port, so a fresh checkout works on
 * whatever port Next picked. In production we trust nothing: an unset
 * variable there is a configuration error, and failing closed is the
 * only safe reading of it.
 */
export function resolveTrustedOrigins(env: {
  NEXT_PUBLIC_APP_URL?: string;
  NODE_ENV?: string;
}): string[] {
  if (env.NEXT_PUBLIC_APP_URL) return [env.NEXT_PUBLIC_APP_URL];
  if (env.NODE_ENV === "production") return [];
  return ["http://localhost:*", "http://127.0.0.1:*"];
}
