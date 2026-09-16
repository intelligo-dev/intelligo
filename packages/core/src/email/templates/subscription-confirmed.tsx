import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

// ---------------------------------------------------------------------------
// Subscription Confirmed Template (EMAIL-12)
// ---------------------------------------------------------------------------
// Sent when a workspace successfully subscribes to a paid plan.
// ---------------------------------------------------------------------------

export interface SubscriptionConfirmedEmailProps {
  workspaceName: string;
  planName: string;
  amount: string;
  dashboardUrl: string;
}

export function SubscriptionConfirmedEmail({
  workspaceName,
  planName,
  amount,
  dashboardUrl,
}: SubscriptionConfirmedEmailProps) {
  const text = {
    preview: `Subscription confirmed for ${workspaceName}`,
    heading: "Subscription Confirmed",
    body1: "Your workspace",
    body2: "is now on the",
    body3: "plan.",
    amountLabel: "Amount:",
    perMonth: "/month",
    button: "Go to Dashboard",
    note: "You can manage your subscription from the billing settings.",
  };

  return (
    <BaseLayout preview={text.preview}>
      <Text style={headingStyle}>{text.heading}</Text>
      <Text style={bodyTextStyle}>
        {text.body1} &lsquo;{workspaceName}&rsquo; {text.body2}{" "}
        <strong>{planName}</strong> {text.body3}
      </Text>
      <Text style={detailStyle}>
        {text.amountLabel} {amount}
        {text.perMonth}
      </Text>
      <Button href={dashboardUrl} style={buttonStyle}>
        {text.button}
      </Button>
      <Text style={noteStyle}>{text.note}</Text>
    </BaseLayout>
  );
}

// ---------------------------------------------------------------------------
// Inline Styles
// ---------------------------------------------------------------------------

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

const detailStyle: React.CSSProperties = {
  color: "#18181b",
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "24px",
  margin: "0 0 16px",
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
