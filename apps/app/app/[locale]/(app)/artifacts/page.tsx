import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { listDocuments } from "@/actions/documents";
import { DocumentList } from "@/components/artifacts/document-list";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/ui/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("artifacts");
  return { title: t("page.title") };
}

/**
 * Every artifact the user created in the active workspace, fetched once;
 * filtering and the preview dialog are client-side.
 *
 * `force-dynamic` because `listDocuments()` reads the session, so a
 * static prerender would fail at build time.
 */
export const dynamic = "force-dynamic";

export default async function ArtifactsPage() {
  const [t, result] = await Promise.all([
    getTranslations("artifacts"),
    listDocuments(),
  ]);

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>{t("page.heading")}</PageHeaderTitle>
          <PageHeaderDescription>{t("page.description")}</PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {result.success ? (
        <DocumentList documents={result.data} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("page.unavailableTitle")}</CardTitle>
            <CardDescription>{result.error}</CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
