"use client";

/**
 * Invite member form — owner/admin only. Client-side required-field
 * checks are handled by the `email` input; server-side validation
 * errors from the action are surfaced inline.
 */

import { useState, useTransition, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { inviteMember } from "@/actions/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function InviteMemberForm() {
  const t = useTranslations("team-settings");
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await inviteMember({ email, role });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(t("inviteForm.inviteSent", { email }));
      setEmail("");
      setRole("member");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("inviteForm.title")}</CardTitle>
        <CardDescription>{t("inviteForm.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t("inviteForm.emailLabel")}</Label>
            <Input
              id="email"
              type="email"
              placeholder={t("inviteForm.emailPlaceholder")}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isPending}
              required
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">{t("inviteForm.roleLabel")}</Label>
            <Select
              value={role}
              onValueChange={(value) => setRole(value as "admin" | "member")}
              disabled={isPending}
            >
              <SelectTrigger id="role">
                <SelectValue placeholder={t("inviteForm.rolePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{t("roles.member")}</SelectItem>
                <SelectItem value="admin">{t("roles.admin")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={isPending}>
            {isPending ? t("inviteForm.submitPending") : t("inviteForm.submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
