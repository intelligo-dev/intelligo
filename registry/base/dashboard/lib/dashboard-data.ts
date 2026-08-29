import "server-only";

/**
 * Dashboard data seam — consumer-owned, read by the dashboard page on
 * the server.
 *
 * `getResume` answers "what was this person in the middle of?" The
 * default is the most recently updated conversation, which is right for
 * a generic AI workspace. A product whose work has real structure —
 * a multi-phase assessment, a wizard, a review queue — binds its own
 * notion of progress here and the hero's resume pill picks it up with
 * no component edit:
 *
 *   export async function getResume(actor: ResumeActor) {
 *     const run = await getActiveAssessment(actor.workspaceId, actor.userId);
 *     if (!run) return null;
 *     return {
 *       label: `Phase ${run.phase} of ${run.totalPhases}`,
 *       href: `/chat/${run.conversationId}`,
 *     };
 *   }
 *
 * Return `null` when there is nothing to resume — the pill is hidden
 * rather than rendered empty.
 */

import { listConversations } from "@intelligo-dev/core/conversations";

export interface ResumeActor {
  workspaceId: string;
  userId: string;
}

export interface ResumeTarget {
  /**
   * Plain text for the pill (already localized by whoever produced
   * it). Omit to let the dashboard use its own "continue" copy.
   */
  label?: string;
  /** Locale-less href; `@/i18n/navigation`'s Link localizes it. */
  href: string;
}

export async function getResume(
  actor: ResumeActor,
  options?: { chatBasePath?: string }
): Promise<ResumeTarget | null> {
  const [latest] = await listConversations(actor, { limit: 1 });
  if (!latest) return null;

  const base = options?.chatBasePath ?? "/chat";
  return {
    label: latest.title ?? undefined,
    href: `${base}/${latest.id}`,
  };
}
