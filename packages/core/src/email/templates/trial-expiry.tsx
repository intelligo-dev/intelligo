import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

// `daysRemaining` switches between the reminder and expired variants.

export interface TrialExpiryEmailProps {
  workspaceName: string;
  expiryDate: string;
  daysRemaining: number;
  upgradeUrl: string;
}

export function TrialExpiryEmail({
  workspaceName,
  expiryDate,
  daysRemaining,
  upgradeUrl,
}: TrialExpiryEmailProps) {
  const isExpired = daysRemaining <= 0;
  const isUrgent = daysRemaining <= 1 && daysRemaining > 0;

  const days = `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`;
  const text = {
    previewExpired: "Your trial has ended",
    previewExpiring: `Your trial ends in ${days}`,
    headingExpired: "Your Trial Has Ended",
    headingExpiring: `Your Trial Ends in ${days}`,
    buttonExpired: "Choose a Plan",
    buttonUpgrade: "Upgrade Now",
  };

  return (
    <BaseLayout
      preview={isExpired ? text.previewExpired : text.previewExpiring}
    >
      <Text style={headingStyle}>
        {isExpired ? text.headingExpired : text.headingExpiring}
      </Text>

      {isExpired ? (
        <>
          <Text style={bodyTextStyle}>
            The trial for &lsquo;{workspaceName}&rsquo; has ended, and the
            workspace is back on its plan&rsquo;s limits. All your data has been
            preserved.
          </Text>
          <Text style={bodyTextStyle}>
            Upgrade to restore what the trial included.
          </Text>
        </>
      ) : (
        <>
          <Text style={bodyTextStyle}>
            The trial for &lsquo;{workspaceName}&rsquo; ends on{" "}
            <strong>{expiryDate}</strong>. After that the workspace goes back to
            its plan&rsquo;s limits; all your data will be preserved.
          </Text>
          {isUrgent && (
            <Text style={urgentTextStyle}>
              Upgrade today to keep what the trial includes.
            </Text>
          )}
          <Text style={secondaryTextStyle}>
            No action is needed if the current plan is enough for you.
          </Text>
        </>
      )}

      <Button href={upgradeUrl} style={buttonStyle}>
        {isExpired ? text.buttonExpired : text.buttonUpgrade}
      </Button>
    </BaseLayout>
  );
}

const headingStyle: React.CSSProperties = {
  color: "#18181b",
  fontSize: "22px",
  fontWeight: 700,
  lineHeight: "30px",
  margin: "0 0 16px",
};

const bodyTextStyle: React.CSSProperties = {
  color: "#18181b",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 12px",
};

const urgentTextStyle: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "16px",
  fontWeight: 700,
  lineHeight: "24px",
  margin: "12px 0",
  padding: "12px",
  backgroundColor: "#fef2f2",
  borderRadius: "6px",
  border: "1px solid #fecaca",
};

const secondaryTextStyle: React.CSSProperties = {
  color: "#71717a",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "12px 0 0",
  fontStyle: "italic",
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: "#7c3aed",
  borderRadius: "6px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "100%",
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
  marginTop: "16px",
};
