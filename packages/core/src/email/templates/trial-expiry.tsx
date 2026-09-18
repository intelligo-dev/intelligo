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

  const text = {
    previewExpired: "Your Pro trial has expired",
    previewExpiring: `Your Pro trial expires in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`,
    headingExpired: "Your Pro Trial Has Expired",
    headingExpiring: `Your Pro Trial Expires in ${daysRemaining} Day${daysRemaining === 1 ? "" : "s"}`,
    buttonExpired: "Upgrade to Pro",
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
            Your 14-day Pro trial for &lsquo;{workspaceName}&rsquo; has ended.
          </Text>
          <Text style={bodyTextStyle}>
            Your workspace has been downgraded to the Free plan. All your data
            has been preserved and you can continue using Intelligo with the
            Free plan limits.
          </Text>
          <Text style={warningTextStyle}>
            What you&rsquo;ll be missing on the Free plan:
          </Text>
          <Text style={listItemStyle}>• 100K tokens/month instead of 2M</Text>
          <Text style={listItemStyle}>
            • Access to basic models only (GPT-4o mini)
          </Text>
          <Text style={listItemStyle}>• 10 conversations instead of 100</Text>
          <Text style={listItemStyle}>• Single workspace instead of 3</Text>
          <Text style={bodyTextStyle}>
            Upgrade to Pro to restore full access and continue building with AI.
          </Text>
        </>
      ) : (
        <>
          <Text style={bodyTextStyle}>
            Your 14-day Pro trial for &lsquo;{workspaceName}&rsquo; expires on{" "}
            <strong>{expiryDate}</strong>.
          </Text>
          <Text style={bodyTextStyle}>
            When your trial ends, your workspace will be downgraded to the Free
            plan. All your data will be preserved.
          </Text>
          {isUrgent && (
            <Text style={urgentTextStyle}>
              This is your last chance to upgrade before losing Pro features!
            </Text>
          )}
          <Text style={warningTextStyle}>
            What happens after your trial expires:
          </Text>
          <Text style={listItemStyle}>
            • Token quota: 2M → 100K tokens/month
          </Text>
          <Text style={listItemStyle}>
            • AI models: All models → Basic models only
          </Text>
          <Text style={listItemStyle}>• Conversations: 100 → 10</Text>
          <Text style={listItemStyle}>• Workspaces: 3 → 1</Text>
          <Text style={secondaryTextStyle}>
            No action needed if you&rsquo;re happy with the Free plan. Your
            workspace will continue working with Free plan limits.
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

const warningTextStyle: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "24px",
  margin: "12px 0 8px",
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

const listItemStyle: React.CSSProperties = {
  color: "#52525b",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "4px 0 4px 8px",
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
