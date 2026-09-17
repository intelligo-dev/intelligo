import { getLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";

/**
 * `/chat` landing — redirects into a freshly-minted conversation id.
 *
 * No `conversations` row is created here. The row is created lazily
 * by `app/api/chat/route.ts` on the first POST for this id, so
 * visiting `/chat` and then never sending a message leaves nothing
 * behind (conversations are a persistence concern the route
 * owns, not a page-load side effect).
 */
export default async function ChatIndexPage() {
  const locale = await getLocale();
  redirect({ href: `/chat/${crypto.randomUUID()}`, locale });
}
