"use client";

/**
 * Accept/decline buttons for the invitation-accept page.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptInvitation, rejectInvitation } from "@/actions/invitation";

interface InvitationActionsProps {
  invitationId: string;
}

export function InvitationActions({ invitationId }: InvitationActionsProps) {
  const t = useTranslations("invitation-accept");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  async function handleAccept() {
    setError(null);
    setIsAccepting(true);

    const result = await acceptInvitation(invitationId);

    if (!result.success) {
      setError(result.error);
      toast.error(result.error);
      setIsAccepting(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  async function handleDecline() {
    setError(null);
    setIsDeclining(true);

    const result = await rejectInvitation(invitationId);

    if (!result.success) {
      setError(result.error);
      toast.error(result.error);
      setIsDeclining(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  const isPending = isAccepting || isDeclining;

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-3">
        <Button onClick={handleAccept} disabled={isPending} size="lg">
          {isAccepting ? t("actions.acceptPending") : t("actions.accept")}
        </Button>
        <Button
          onClick={handleDecline}
          disabled={isPending}
          variant="outline"
          size="lg"
        >
          {isDeclining ? t("actions.declinePending") : t("actions.decline")}
        </Button>
      </div>
    </div>
  );
}
