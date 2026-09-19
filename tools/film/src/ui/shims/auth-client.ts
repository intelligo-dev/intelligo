/**
 * Stand-in for `@intelligo-dev/auth/client` — adapted from
 * apps/website/src/showcase/app/shims/auth-client.ts. Only referenced from
 * event handlers (sign out, switch workspace) that a rendered video
 * never fires, so it needs no real behavior — just a shape that
 * type-checks against what UserMenu/WorkspaceSwitcher call.
 */
type Callbacks = {
  onRequest?: () => void;
  onSuccess?: (ctx: { data: unknown }) => void;
};

async function ok<T>(
  data: T,
  callbacks?: Callbacks,
): Promise<{ data: T; error: null }> {
  callbacks?.onSuccess?.({ data });
  return { data, error: null };
}

export const authClient = {
  signOut: (callbacks?: Callbacks) => ok({ success: true }, callbacks),
  organization: {
    setActive: (_body: unknown, callbacks?: Callbacks) =>
      ok({ id: "org_preview" }, callbacks),
  },
};
