import "server-only";

/**
 * Profile service binding — the composition-root wiring for the
 * profile-settings item. Binds a plain-English account-deletion
 * confirmation email via `@intelligo-dev/core/email`'s `sendEmail` into the
 * framework-owned profile service (`@intelligo-dev/auth`).
 *
 * `sendEmail` never throws (it swallows provider errors into its own
 * result object) and the service itself already treats
 * `onAccountDeleted` as fire-and-forget, so no extra error handling is
 * needed here. Replace the copy below with your own template, or drop
 * the `onAccountDeleted` binding entirely to send no email at all.
 */

import { getTranslations } from "next-intl/server";

import { createProfileService } from "@intelligo-dev/auth";
import { sendEmail } from "@intelligo-dev/core/email";

export const profile = createProfileService({
  onAccountDeleted: async ({ email }) => {
    const t = await getTranslations("profile-settings");
    await sendEmail({
      to: email,
      subject: t("email.subject"),
      html: `
        <h2>${t("email.heading")}</h2>
        <p>${t("email.body", { email })}</p>
        <p>${t("email.warning")}</p>
      `,
    });
  },
});
