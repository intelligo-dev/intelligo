/** Types from the dashboard item's `lib/dashboard-data.ts`; the data itself is a server read and is fixtured in the preview. */
export interface ResumeActor {
  workspaceId: string;
  userId: string;
}
export interface ResumeTarget {
  label?: string;
  /** Locale-less href; `@/i18n/navigation`'s Link localizes it. */
  href: string;
}
