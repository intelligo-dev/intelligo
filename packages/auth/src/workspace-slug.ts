/**
 * The slug an auto-provisioned personal workspace gets.
 *
 * Deterministic on purpose. Two paths provision a first workspace —
 * the `user.create` hook in `server.ts` and the layout's
 * `ensureUserWorkspace` fallback — and several requests can reach the
 * fallback at once, because the `(app)` layout re-renders for every
 * request that enters the group (the document, each prefetched sibling
 * route, an error-boundary retry).
 *
 * A slug derived from the user makes `organization.slug`'s unique index
 * the arbiter: the first caller wins, every other one gets
 * `ORGANIZATION_ALREADY_EXISTS` and adopts the winner's workspace. The
 * previous `Date.now().toString(36)` suffix differed per attempt, so
 * the constraint never fired and each racer created a workspace of its
 * own — three signups' worth of "Welcome to your workspace" for one
 * person.
 *
 * Only the automatic personal workspace is named this way; a workspace
 * someone creates by hand names itself.
 */
export function personalWorkspaceSlug(
  email: string | null | undefined,
  userId: string
): string {
  const base = ((email || "user").split("@")[0] || "user").slice(0, 30);
  // The id fragment is normalised with the rest: Better-Auth ids are
  // mixed-case, and a slug the workspace settings form refuses
  // (`[a-z0-9-]+`) makes the personal workspace impossible to rename.
  return toSlug(`${base}-${userId.slice(0, 8)}`);
}

function toSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "-");
}
