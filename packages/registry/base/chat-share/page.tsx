import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SharedConversation } from "@/components/chat/shared-conversation";
import { loadSharedConversation } from "@/actions/chat-share";

/**
 * `/share/[id]` — a conversation its owner published, readable by
 * anyone with the link. Outside the `(app)` group on purpose: no
 * session, no workspace. `noindex`, so a link that leaks does not also
 * get crawled. Per-request, since sharing can be switched off.
 */
export const dynamic = "force-dynamic";

interface SharePageProps {
  params: Promise<{ id: string; locale: string }>;
}

export async function generateMetadata({
  params,
}: SharePageProps): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("chat-share");
  const shared = await loadSharedConversation(id);
  return {
    title: shared?.title ?? t("title"),
    robots: { index: false, follow: false },
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { id } = await params;
  const shared = await loadSharedConversation(id);
  if (!shared) notFound();

  return (
    <SharedConversation
      conversationId={shared.id}
      title={shared.title}
      messages={shared.messages}
    />
  );
}
