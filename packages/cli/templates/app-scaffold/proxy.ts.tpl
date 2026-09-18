/**
 * Next 16 names this file `proxy.ts` (`middleware.ts` still resolves).
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
