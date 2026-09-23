/**
 * Guards for Route Handlers: each wrapper resolves the caller before the
 * handler runs and answers a failed check itself, as JSON —
 *
 *     export const GET = withRole(["owner", "admin"], async (request, { workspace }) =>
 *       Response.json(await listInvoices(workspace.id))
 *     );
 *
 * `unauthenticated` → 401; `no_workspace` and `forbidden` → 403; the
 * body is `{ "error": <AuthGuardErrorCode> }`. Only the guard's own
 * failure is mapped: whatever the handler throws propagates unchanged,
 * an `AuthGuardError` included, so a bug inside a handler is never
 * reported as an auth failure.
 *
 * A subpath of its own, like `./auth`, because it loads the configured
 * Better-Auth server instance, which binding the request context must
 * not.
 */

import "server-only";

import {
  isAuthGuardError,
  requireAuth,
  requireRole,
  requireWorkspace,
  type AuthGuardErrorCode,
  type WorkspaceRole,
} from "@intelligo-dev/auth";

/** What `requireAuth()` resolves: the session and its user. */
export type AuthContext = Awaited<ReturnType<typeof requireAuth>>;

/** What `requireWorkspace()` resolves: session, user, workspace and membership. */
export type WorkspaceContext = Awaited<ReturnType<typeof requireWorkspace>>;

/**
 * A guarded handler: the request, what the guard resolved, and the
 * Route Handler's own second argument (`{ params }` on a dynamic route).
 */
export type GuardedHandler<Guarded, Context> = (
  request: Request,
  guarded: Guarded,
  context: Context
) => Response | Promise<Response>;

/** The Route Handler a wrapper returns. */
export type RouteHandler<Context> = (
  request: Request,
  context: Context
) => Promise<Response>;

const STATUS: Record<AuthGuardErrorCode, number> = {
  unauthenticated: 401,
  no_workspace: 403,
  forbidden: 403,
};

/** The JSON response for a failed guard. */
export function authErrorResponse(code: AuthGuardErrorCode): Response {
  return Response.json({ error: code }, { status: STATUS[code] });
}

function guarded<Guarded, Context>(
  guard: () => Promise<Guarded>,
  handler: GuardedHandler<Guarded, Context>
): RouteHandler<Context> {
  return async (request, context) => {
    let resolved: Guarded;
    try {
      resolved = await guard();
    } catch (error) {
      if (isAuthGuardError(error)) return authErrorResponse(error.code);
      throw error;
    }
    return handler(request, resolved, context);
  };
}

/** Runs `handler` for a signed-in caller; 401 otherwise. */
export function withAuth<Context = unknown>(
  handler: GuardedHandler<AuthContext, Context>
): RouteHandler<Context> {
  return guarded(requireAuth, handler);
}

/**
 * Runs `handler` for a signed-in caller acting in a workspace; 401
 * without a session, 403 without a workspace. Every query the handler
 * makes filters by `workspace.id`.
 */
export function withWorkspace<Context = unknown>(
  handler: GuardedHandler<WorkspaceContext, Context>
): RouteHandler<Context> {
  return guarded(requireWorkspace, handler);
}

/**
 * Runs `handler` for a member holding one of `roles` in the active
 * workspace; 401 without a session, 403 without a workspace or the role.
 */
export function withRole<Context = unknown>(
  roles: WorkspaceRole[],
  handler: GuardedHandler<WorkspaceContext, Context>
): RouteHandler<Context> {
  return guarded(() => requireRole(roles), handler);
}
