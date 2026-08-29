import createIntlMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

export default createIntlMiddleware(routing);

export const config = {
  // Run on everything except API routes, Next internals and static
  // assets — mirrors the product application's middleware matcher, simplified: this
  // app has no composed auth step to run over /api here.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
