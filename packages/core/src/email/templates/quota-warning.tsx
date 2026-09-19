import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

// `isExceeded` switches between the 80% warning and the used-up variant.
// `used` and `allowance` arrive formatted: the plan allowance is money in
// the deployment's billing currency, and the sender owns the formatting.

export interface QuotaWarningEmailProps {
  workspaceName: string;
  percentageUsed: number;
  used: string;
  allowance: string;
  upgradeUrl: string;
  isExceeded: boolean;
}

export function QuotaWarningEmail({
  workspaceName,
  percentageUsed,
  used,
  allowance,
  upgradeUrl,
  isExceeded,
}: QuotaWarningEmailProps) {
  const text = {
    previewExceeded: "Your monthly allowance is used up",
    previewWarning: `You've used ${percentageUsed}% of your monthly allowance`,
    headingExceeded: "Allowance Used Up",
    headingWarning: "Allowance Warning",
    bodyExceeded1: "Your workspace",
    bodyExceeded2: "has used all of its",
    bodyExceeded3: "monthly allowance.",
    warningText:
      "AI features are currently restricted until your allowance resets or you upgrade.",
    bodyWarning1: "Your workspace",
    bodyWarning2: "has used",
    bodyWarning3: "of its",
    bodyWarning4: "monthly allowance",
    button: "Upgrade Plan",
    note: "Your allowance resets at the start of next month.",
  };

  return (
    <BaseLayout
      preview={isExceeded ? text.previewExceeded : text.previewWarning}
    >
      <Text style={headingStyle}>
        {isExceeded ? text.headingExceeded : text.headingWarning}
      </Text>

      {isExceeded ? (
        <>
          <Text style={bodyTextStyle}>
            {text.bodyExceeded1} &lsquo;{workspaceName}&rsquo;{" "}
            {text.bodyExceeded2} {allowance} {text.bodyExceeded3}
          </Text>
          <Text style={warningTextStyle}>{text.warningText}</Text>
        </>
      ) : (
        <Text style={bodyTextStyle}>
          {text.bodyWarning1} &lsquo;{workspaceName}&rsquo; {text.bodyWarning2}{" "}
          {used} {text.bodyWarning3} {allowance} {text.bodyWarning4} (
          {percentageUsed}%).
        </Text>
      )}

      <Button href={upgradeUrl} style={buttonStyle}>
        {text.button}
      </Button>
      <Text style={noteStyle}>{text.note}</Text>
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
  margin: "0 0 12px",
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
  marginTop: "8px",
};

const noteStyle: React.CSSProperties = {
  color: "#71717a",
  fontSize: "13px",
  lineHeight: "20px",
  marginTop: "20px",
};
