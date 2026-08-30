import { wait, daysAgo, PREVIEW_NOTE } from "./_preview";

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
import type { DocumentListItem } from "@intelligo-dev/core/documents";

export type ArtifactListItem = DocumentListItem & { isReport: boolean };

export const DOCUMENTS: ArtifactListItem[] = [
  {
    id: "doc_1",
    title: "Q3 support tickets — summary",
    kind: "text",
    createdAt: daysAgo(0, 5),
    agentLabel: "Assistant",
    content:
      "# Q3 support tickets\n\nThree themes dominate: onboarding friction, billing questions, and export requests.",
    isReport: true,
  },
  {
    id: "doc_2",
    title: "Pricing audit",
    kind: "text",
    createdAt: daysAgo(3),
    agentLabel: "Assistant",
    content: "Pro at $29 sits below the median of eight comparable tools…",
    isReport: true,
  },
  {
    id: "doc_3",
    title: "Onboarding flow notes",
    kind: "text",
    createdAt: daysAgo(1),
    agentLabel: "Assistant",
    content:
      "Step 2 loses 18% of sign-ups; the workspace name field is the culprit.",
    isReport: false,
  },
  {
    id: "doc_4",
    title: "export.csv",
    kind: "sheet",
    createdAt: daysAgo(1),
    agentLabel: "Assistant",
    content: null,
    isReport: false,
  },
];

export async function listDocuments(): Promise<
  ActionResult<ArtifactListItem[]>
> {
  await wait(300);
  return { success: true, data: DOCUMENTS };
}
export async function deleteLatestVersion(
  ..._args: unknown[]
): Promise<ActionResult<undefined>> {
  await wait();
  return {
    success: false,
    error: `Deleting a version is disabled here. ${PREVIEW_NOTE}`,
  };
}
