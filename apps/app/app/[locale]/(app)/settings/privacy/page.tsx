import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ExportDataButton } from "@/components/privacy/export-data-button";
import { FactList } from "@/components/privacy/fact-list";
import { getAuditTrail, listFacts } from "@/actions/privacy";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy-settings");
  return { title: t("page.title") };
}

export default async function PrivacySettingsPage() {
  const t = await getTranslations("privacy-settings");
  const format = await getFormatter();
  const [facts, auditTrail] = await Promise.all([listFacts(), getAuditTrail()]);

  return (
    <div className="container mx-auto max-w-2xl space-y-6 px-4 py-8">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{t("page.title")}</PageHeaderTitle>
          <PageHeaderDescription>{t("page.description")}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>{t("page.export.title")}</CardTitle>
          <CardDescription>{t("page.export.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ExportDataButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("page.yourData.title")}</CardTitle>
          <CardDescription>{t("page.yourData.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FactList initialFacts={facts} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("page.auditTrail.title")}</CardTitle>
          <CardDescription>
            {t("page.auditTrail.description", { count: auditTrail.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {auditTrail.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("page.auditTrail.empty")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {auditTrail.map((row) => (
                <li key={row.id} className="py-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="font-medium capitalize">
                      {row.action} · {row.targetKind}
                    </span>
                    <time
                      dateTime={new Date(row.createdAt).toISOString()}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      {format.dateTime(new Date(row.createdAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </div>
                  {row.reason && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.reason}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
