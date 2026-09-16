import { wait } from "./_preview";

export type OnboardingActionResult<T = undefined> =
  { success: true; data: T } | { success: false; error: string };

export async function advanceStep(
  ..._args: unknown[]
): Promise<OnboardingActionResult> {
  await wait(250);
  return { success: true, data: undefined };
}
export async function completeOnboarding(): Promise<OnboardingActionResult> {
  await wait(400);
  return { success: true, data: undefined };
}
export async function skipOnboarding(): Promise<OnboardingActionResult> {
  await wait(250);
  return { success: true, data: undefined };
}
export async function saveDisplayName(
  ..._args: unknown[]
): Promise<OnboardingActionResult> {
  await wait(250);
  return { success: true, data: undefined };
}
