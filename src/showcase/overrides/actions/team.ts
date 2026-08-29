import { wait, PREVIEW_NOTE } from "./_preview";

export type TeamActionResult<T = undefined> = { success: true; data: T } | { success: false; error: string };

export async function inviteMember(..._args: unknown[]): Promise<TeamActionResult> {
  await wait();
  return { success: false, error: `The invitation email would be sent here. ${PREVIEW_NOTE}` };
}
export async function cancelInvitation(..._args: unknown[]): Promise<TeamActionResult> {
  await wait();
  return { success: true, data: undefined };
}
export async function removeMember(..._args: unknown[]): Promise<TeamActionResult> {
  await wait();
  return { success: true, data: undefined };
}
export async function updateMemberRole(..._args: unknown[]): Promise<TeamActionResult> {
  await wait();
  return { success: true, data: undefined };
}
