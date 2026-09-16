import { wait, PREVIEW_NOTE } from "./_preview";

export type WorkspaceActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

export async function updateWorkspace(
  ..._args: unknown[]
): Promise<WorkspaceActionResult> {
  await wait();
  return { success: true, data: undefined };
}
// The real action redirects to the dashboard once the workspace is gone.
export async function deleteWorkspace(
  ..._args: unknown[]
): Promise<WorkspaceActionResult> {
  await wait();
  return {
    success: false,
    error: `The workspace would be deleted here. ${PREVIEW_NOTE}`,
  };
}
