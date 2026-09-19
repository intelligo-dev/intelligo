import { wait } from "./_preview";

export type SharedConversation = {
  id: string;
  title: string | null;
  updatedAt: string;
  messages: unknown[];
};

export async function loadSharedConversation(
  ..._args: unknown[]
): Promise<SharedConversation | null> {
  await wait();
  return null;
}
