import { getAuthSession } from "@intelligo-dev/auth";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/**
 * The root URL — a session decides where you land: the dashboard when
 * signed in (the `dashboard` registry item), the login page otherwise
 * (`auth-login`). Replace it with a landing page of your own whenever
 * you like; it is yours.
 */
export default async function Home() {
  const locale = await getLocale();
  const session = await getAuthSession();
  redirect({ href: session ? "/dashboard" : "/login", locale });
}
