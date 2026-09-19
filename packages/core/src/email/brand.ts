/**
 * Whose emails these are. Every deployment sends as itself, so the name
 * and the support address come from its environment, never from the
 * framework:
 *
 * - `APP_NAME` — the product's name. Falls back to the display name in
 *   `EMAIL_FROM` ("Acme <noreply@acme.com>" → "Acme").
 * - `SUPPORT_EMAIL` — where a reader can write back. Without it the
 *   footer offers no address rather than someone else's.
 */
export type EmailBrand = {
  /** Empty when neither variable names one. */
  name: string;
  supportEmail: string | null;
};

export function emailBrand(): EmailBrand {
  const from = process.env.EMAIL_FROM?.trim() ?? "";
  const display = /^"?([^"<]+?)"?\s*</.exec(from)?.[1]?.trim() ?? "";
  return {
    name: process.env.APP_NAME?.trim() || display,
    supportEmail: process.env.SUPPORT_EMAIL?.trim() || null,
  };
}
