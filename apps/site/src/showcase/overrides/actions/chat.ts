import { wait, daysAgo, PREVIEW_NOTE } from "./_preview";

export type ChatActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
export type ConversationSummary = {
  id: string;
  title: string | null;
  updatedAt: string;
};

export const CONVERSATIONS: ConversationSummary[] = [
  { id: "conv_1", title: "Q3 support tickets", updatedAt: daysAgo(0, 1) },
  { id: "conv_2", title: "Pricing audit", updatedAt: daysAgo(1) },
  { id: "conv_3", title: "Onboarding copy review", updatedAt: daysAgo(4) },
  { id: "conv_4", title: null, updatedAt: daysAgo(9) },
];

export async function listConversationHistory(): Promise<
  ChatActionResult<ConversationSummary[]>
> {
  await wait(200);
  return { success: true, data: CONVERSATIONS };
}
export async function loadConversationForChat(
  ..._args: unknown[]
): Promise<ChatActionResult<unknown>> {
  await wait(200);
  return { success: false, error: PREVIEW_NOTE };
}
export async function renameConversation(
  ..._args: unknown[]
): Promise<ChatActionResult<undefined>> {
  await wait();
  return { success: true, data: undefined };
}
export async function deleteConversation(
  ..._args: unknown[]
): Promise<ChatActionResult<undefined>> {
  await wait();
  return { success: true, data: undefined };
}
export async function saveMessageAsArtifact(
  ..._args: unknown[]
): Promise<ChatActionResult<{ id: string }>> {
  await wait();
  return {
    success: false,
    error: `Saving as an artifact is disabled here. ${PREVIEW_NOTE}`,
  };
}
