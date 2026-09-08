import { wait, PREVIEW_NOTE } from "./_preview";

export type InvitationActionResult =
  | { success: true }
  | { success: false; error: string };

// Both real actions navigate away on success (`router.push("/")`), and the
// component keeps its pending state until that navigation happens — so
// the preview reports what would have happened instead.
export async function acceptInvitation(
  ..._args: unknown[]
): Promise<InvitationActionResult> {
  await wait();
  return {
    success: false,
    error: `You would join Acme Research here. ${PREVIEW_NOTE}`,
  };
}
export async function rejectInvitation(
  ..._args: unknown[]
): Promise<InvitationActionResult> {
  await wait();
  return {
    success: false,
    error: `The invitation would be declined here. ${PREVIEW_NOTE}`,
  };
}
