/**
 * The Better-Auth React client. Import only from "use client" components;
 * server code uses `@intelligo-dev/auth`.
 */

import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";

// No `baseURL`: the client and server share an origin (`/api/auth/*`), so
// Better-Auth defaults to `window.location.origin`. An absolute URL is
// blocked by the app's CSP (`connect-src 'self'`) whenever its port differs
// from the one the app is served on.
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
