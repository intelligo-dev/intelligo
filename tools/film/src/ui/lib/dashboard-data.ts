/**
 * `dashboard-data.ts` is server-only (reads conversations from the DB)
 * and gets dropped by sync-ui.mjs's SERVER_MARKERS filter — but
 * `dashboard-hero.tsx` still needs `ResumeTarget`'s *type* to accept
 * the `resume` fixture Film.tsx passes it. Type only, no `getResume`.
 */
export interface ResumeTarget {
  label?: string;
  href: string;
}
