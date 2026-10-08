import { wait, PREVIEW_NOTE } from "./_preview";

export type ActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

// The real action clears the account's scheduled deletion.
export async function restoreAccount(): Promise<ActionResult> {
  await wait();
  return {
    success: false,
    error: `The account would be restored here. ${PREVIEW_NOTE}`,
  };
}
