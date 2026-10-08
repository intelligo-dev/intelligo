import "server-only";

/**
 * Binds the profile service (`@intelligo-dev/auth`): the confirmation
 * email sent through `sendEmail` (`@intelligo-dev/core/email`) when an
 * account is scheduled for deletion, and the subscription of each
 * workspace the account owns alone, ended as that workspace is deleted
 * with it (`beginWorkspaceSubscriptionCancellation`, the same binding the
 * workspace service takes). `sendEmail` never throws and the service
 * treats `onAccountDeleted` as fire-and-forget, so no error handling is
 * needed. Drop the `onAccountDeleted` binding to send no email.
 */

import { getTranslations } from "next-intl/server";

import { createProfileService } from "@intelligo-dev/auth";
import { beginWorkspaceSubscriptionCancellation } from "@intelligo-dev/billing";
import { sendEmail } from "@intelligo-dev/core/email";

export const profile = createProfileService({
  onAccountDeleted: async ({ email, restorableUntil }) => {
    const t = await getTranslations("profile-settings");
    await sendEmail({
      to: email,
      subject: t("email.subject"),
      html: `
        <h2>${t("email.heading")}</h2>
        <p>${t("email.body", { email, date: restorableUntil })}</p>
        <p>${t("email.restore")}</p>
        <p>${t("email.warning")}</p>
      `,
    });
  },
  beforeDeleteWorkspace: beginWorkspaceSubscriptionCancellation,
});
