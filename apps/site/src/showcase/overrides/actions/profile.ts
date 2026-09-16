import { wait, PREVIEW_NOTE } from "./_preview";

export type ProfileActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

export async function updateProfile(
  ..._args: unknown[]
): Promise<ProfileActionResult> {
  await wait();
  return { success: true, data: undefined };
}
// The real action signs the user out everywhere and sends them to /login.
export async function deleteAccount(
  ..._args: unknown[]
): Promise<ProfileActionResult> {
  await wait();
  return {
    success: false,
    error: `Your account would be scheduled for deletion here. ${PREVIEW_NOTE}`,
  };
}
