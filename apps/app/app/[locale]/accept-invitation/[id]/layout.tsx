import type { ReactNode } from "react";
import { getLocale } from "next-intl/server";

import { getAuthSession } from "@intelligo-dev/auth";

import { redirect } from "@/i18n/navigation";

/**
 * Sends a visitor without a session to sign in, and back here after.
 * A layout rather than the page: the page streams behind `loading.tsx`,
 * and a server redirect thrown mid-stream does not move the browser.
 */
export default async function AcceptInvitationLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  if (!(await getAuthSession())) {
    const { id } = await params;
    const here = `/accept-invitation/${encodeURIComponent(id)}`;
    redirect({
      href: `/login?next=${encodeURIComponent(here)}`,
      locale: await getLocale(),
    });
  }
  return children;
}
