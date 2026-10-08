"use client";

/**
 * The restore screen's two choices: restore the account (the
 * `restoreAccount` action), or sign out and leave it scheduled for
 * deletion. Only signing out is offered once it can no longer be restored.
 */

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { authClient } from "@intelligo-dev/auth/client";

import { restoreAccount } from "@/actions/account-restore";
import { useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function RestoreAccountForm({ restorable }: { restorable: boolean }) {
  const t = useTranslations("auth-login");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [restoring, startRestore] = useTransition();
  const [signingOut, startSignOut] = useTransition();

  function handleRestore() {
    setError(null);
    startRestore(async () => {
      const result = await restoreAccount();
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function handleSignOut() {
    startSignOut(async () => {
      await authClient.signOut();
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {restorable && (
        <Button
          className="w-full"
          onClick={handleRestore}
          disabled={restoring || signingOut}
        >
          {restoring ? (
            <>
              <Spinner />
              {t("restore.restoring")}
            </>
          ) : (
            t("restore.confirm")
          )}
        </Button>
      )}
      <Button
        variant="outline"
        className="w-full"
        onClick={handleSignOut}
        disabled={restoring || signingOut}
      >
        {t("restore.signOut")}
      </Button>
    </div>
  );
}
