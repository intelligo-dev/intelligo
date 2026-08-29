/** Shared helpers for the preview's stand-in server actions. */
export const wait = (ms = 500) => new Promise<void>((r) => setTimeout(r, ms));
export const PREVIEW_NOTE = "This is the preview on intelligo.dev — in your app this action runs against your database.";
export const TODAY = new Date("2026-08-29T09:00:00Z");
export const daysAgo = (n: number, hours = 0) => new Date(TODAY.getTime() - n * 86_400_000 - hours * 3_600_000).toISOString();
