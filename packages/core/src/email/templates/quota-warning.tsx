import { Button, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

// ---------------------------------------------------------------------------
// Quota Warning Template (EMAIL-09 at 80%, EMAIL-10 at 100%)
// ---------------------------------------------------------------------------
// Sent when a workspace approaches or exceeds its monthly token quota.
// Uses isExceeded flag to toggle between warning and exceeded variants.
// ---------------------------------------------------------------------------

export interface QuotaWarningEmailProps {
  workspaceName: string;
  percentageUsed: number;
  tokensUsed: number;
  tokensLimit: number;
  upgradeUrl: string;
  isExceeded: boolean;
  locale?: "en" | "mn";
}

export function QuotaWarningEmail({
  workspaceName,
  percentageUsed,
  tokensUsed,
  tokensLimit,
  upgradeUrl,
  isExceeded,
  locale = "en",
}: QuotaWarningEmailProps) {
  const text =
    locale === "mn"
      ? {
          previewExceeded: "Таны токены хязгаар хэтэрсэн байна",
          previewWarning: `Та токены хязгаарынхаа ${percentageUsed}%-ийг ашигласан`,
          headingExceeded: "Хязгаар хэтэрсэн",
          headingWarning: "Хязгаарын сануулга",
          bodyExceeded1: "Таны ажлын орчин",
          bodyExceeded2: "энэ сард бүх",
          bodyExceeded3: "токеныг ашигласан байна.",
          warningText:
            "AI функцүүд одоогоор хязгаарлагдсан байна. Хязгаар шинэчлэгдэх эсвэл төлөвлөгөө сонгох хүртэл.",
          bodyWarning1: "Таны ажлын орчин",
          bodyWarning2: "нь",
          bodyWarning3: "токены",
          bodyWarning4: "токеныг ашигласан",
          button: "Төлөвлөгөө сонгох",
          note: "Таны хязгаар дараагийн төлбөрийн хугацаа эхлэхэд шинэчлэгдэнэ.",
        }
      : {
          previewExceeded: "Your token quota is exceeded",
          previewWarning: `You've used ${percentageUsed}% of your token quota`,
          headingExceeded: "Quota Exceeded",
          headingWarning: "Quota Warning",
          bodyExceeded1: "Your workspace",
          bodyExceeded2: "has used all",
          bodyExceeded3: "tokens this month.",
          warningText:
            "AI features are currently restricted until your quota resets or you upgrade.",
          bodyWarning1: "Your workspace",
          bodyWarning2: "has used",
          bodyWarning3: "of",
          bodyWarning4: "tokens",
          button: "Upgrade Plan",
          note: "Your quota resets at the start of your next billing period.",
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
            {text.bodyExceeded2} {tokensLimit.toLocaleString()}{" "}
            {text.bodyExceeded3}
          </Text>
          <Text style={warningTextStyle}>{text.warningText}</Text>
        </>
      ) : (
        <Text style={bodyTextStyle}>
          {text.bodyWarning1} &lsquo;{workspaceName}&rsquo; {text.bodyWarning2}{" "}
          {tokensUsed.toLocaleString()} {text.bodyWarning3}{" "}
          {tokensLimit.toLocaleString()} {text.bodyWarning4}({percentageUsed}%).
        </Text>
      )}

      <Button href={upgradeUrl} style={buttonStyle}>
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
