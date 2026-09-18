import "server-only";

/**
 * Binds the profile service (`@intelligo-dev/auth`) with an
 * account-deletion confirmation email sent through `sendEmail`
 * (`@intelligo-dev/core/email`). `sendEmail` never throws and the
 * service treats `onAccountDeleted` as fire-and-forget, so no error
 * handling is needed. Drop the binding to send no email.
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
