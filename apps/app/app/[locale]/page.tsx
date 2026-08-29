import { getAuthSession } from "@intelligo-dev/auth";
import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/**
 * Root entry — a session decides where you land. The old plain
 * reference landing retired once the registry items made this a real
 * application: signed-in users go to the dashboard, everyone else to
 * login. The package-boundary notes it used to display live in the
 * README.
 */
export default async function Home() {
  const locale = await getLocale();
  const session = await getAuthSession();
  redirect({ href: session ? "/dashboard" : "/login", locale });
}
