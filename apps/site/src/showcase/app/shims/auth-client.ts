/**
 * Stand-in for `@intelligo-dev/auth/client` (better-auth's client). Every
 * call succeeds after a short delay so the forms show their real loading
 * and success states; nothing is sent anywhere.
 */
type Callbacks = {
  onRequest?: () => void;
  onSuccess?: (ctx: { data: unknown }) => void;
  onError?: (ctx: { error: { message: string } }) => void;
};

type Result<T> = { data: T; error: null } | { data: null; error: { message?: string; code?: string; status?: number } };

const USER = { id: "user_preview", name: "You", email: "you@company.com", image: null };

async function ok<T>(data: T, callbacks?: Callbacks): Promise<Result<T>> {
  callbacks?.onRequest?.();
  await new Promise((r) => setTimeout(r, 600));
  callbacks?.onSuccess?.({ data });
  return { data, error: null };
}

export const authClient = {
  signIn: {
    email: (_body: unknown, callbacks?: Callbacks) => ok({ user: USER, token: "preview" }, callbacks),
    social: (_body: unknown, callbacks?: Callbacks) => ok({ url: "#", redirect: false }, callbacks),
  },
  signUp: {
    // No token: the real client returns none when email verification is
    // required, and the form then moves on to the verify step.
    email: (_body: unknown, callbacks?: Callbacks) => ok({ user: USER, token: null as string | null }, callbacks),
  },
  signOut: (callbacks?: Callbacks) => ok({ success: true }, callbacks),
  sendVerificationEmail: (_body: unknown, callbacks?: Callbacks) => ok({ status: true }, callbacks),
  requestPasswordReset: (_body: unknown, callbacks?: Callbacks) => ok({ status: true }, callbacks),
  resetPassword: (_body: unknown, callbacks?: Callbacks) => ok({ status: true }, callbacks),
  organization: {
    create: (_body: unknown, callbacks?: Callbacks) => ok({ id: "org_preview" }, callbacks),
    setActive: (_body: unknown, callbacks?: Callbacks) => ok({ id: "org_preview" }, callbacks),
  },
  useSession: () => ({ data: { user: USER, session: { id: "sess_preview" } }, isPending: false, error: null }),
};
