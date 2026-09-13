/**
 * Next 16 calls this file `proxy.ts`; `middleware.ts` is the Next 15
 * name and still resolves, which is why a scaffold can be wrong here
 * without anything failing. Using the current name keeps a generated
 * app on the path the framework documents rather than the one it is
 * migrating away from.
 *
 * Optimistic only: it redirects, and never touches the database. Every
 * real check is server-side.
 */
import createIntlMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

export default createIntlMiddleware(routing);

export const config = {
  // Run on everything except API routes, Next internals and static
  // assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
