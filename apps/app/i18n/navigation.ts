import { createNavigation } from "next-intl/navigation";

import { routing } from "./routing";

// Registry items and app code import navigation primitives from here
// (`@/i18n/navigation`), never from `next/link` or `next/navigation`
// directly — that's what keeps locale-prefixed URLs correct without
// every item having to know the routing config.
export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);
