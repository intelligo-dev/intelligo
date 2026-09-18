import { Button, Section, Text } from "@react-email/components";
import * as React from "react";
import { BaseLayout } from "./base-layout";

export interface WorkspaceInvitationEmailProps {
  inviterName: string;
  workspaceName: string;
  role: string;
  acceptUrl: string;
  declineUrl: string;
}

export function WorkspaceInvitationEmail({
  inviterName,
  workspaceName,
  role,
  acceptUrl,
  declineUrl,
}: WorkspaceInvitationEmailProps) {
  const text = {
    preview: `${inviterName} invited you to join ${workspaceName}`,
    heading: "You're invited!",
    body: "has invited you to join the workspace",
    as: "as a",
    invitedYou: "",
    acceptButton: "Accept Invitation",
    declineButton: "Decline",
    note: "This invitation expires in 7 days.",
  };

  return (
    <BaseLayout preview={text.preview}>
      <Text style={headingStyle}>{text.heading}</Text>
      <Text style={bodyTextStyle}>
        <strong>{inviterName}</strong> {text.body}{" "}
        <strong>&lsquo;{workspaceName}&rsquo;</strong> {text.as}{" "}
        <strong>{role}</strong>
        {text.invitedYou ? ` ${text.invitedYou}` : ""}.
      </Text>
      <Section style={buttonGroupStyle}>
        <Button href={acceptUrl} style={acceptButtonStyle}>
          {text.acceptButton}
        </Button>
        <Button href={declineUrl} style={declineButtonStyle}>
          {text.declineButton}
        </Button>
      </Section>
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

const buttonGroupStyle: React.CSSProperties = {
  marginTop: "8px",
};

const acceptButtonStyle: React.CSSProperties = {
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
  marginRight: "12px",
};

const declineButtonStyle: React.CSSProperties = {
  backgroundColor: "transparent",
  border: "1px solid #d4d4d8",
  borderRadius: "6px",
  color: "#71717a",
  display: "inline-block",
  fontSize: "15px",
  fontWeight: 600,
  lineHeight: "100%",
  padding: "12px 24px",
  textDecoration: "none",
  textAlign: "center" as const,
};

const noteStyle: React.CSSProperties = {
  color: "#71717a",
  fontSize: "13px",
  lineHeight: "20px",
  marginTop: "20px",
};
