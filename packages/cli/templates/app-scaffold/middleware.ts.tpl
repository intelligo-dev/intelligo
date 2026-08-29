import createIntlMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

export default createIntlMiddleware(routing);

export const config = {
  // Run on everything except API routes, Next internals and static
  // assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
