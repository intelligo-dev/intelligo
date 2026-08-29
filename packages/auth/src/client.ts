/**
 * Better-Auth Client
 *
 * Client-side authentication utilities for React components.
 * This module uses "better-auth/react" which is a client-side module.
 *
 * IMPORTANT: Only import this in "use client" components.
 * For server-side auth, use @intelligo/auth (server.ts)
 */

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

// No `baseURL`: the client and the Better-Auth server always live on the
// same origin (this app's own `/api/auth/*` routes), so Better-Auth's
// client defaults to `window.location.origin` and every request is
// same-origin. Do not reintroduce an absolute `NEXT_PUBLIC_APP_URL`
// baseURL here — the dev port has drifted before (3000 -> 3001 -> 4000)
// and an absolute cross-origin URL is blocked by the app's CSP
// (`connect-src 'self'`) whenever it doesn't match the port the app is
// actually served on.
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

// Export commonly used hooks and methods for convenience
export const { useSession, signIn, signUp, signOut } = authClient;
