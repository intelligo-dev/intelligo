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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("artifacts");
  return { title: t("page.title") };
}

/**
 * Artifacts page — server component.
 *
 * Lists every artifact (AI-generated document — report, code, text,
 * sheet, image, or a product's own custom kind) this user has created
 * in the active workspace, backed by `@intelligo-dev/core/documents`
 * (ADR-0009). Filtering by type and the content-preview dialog are
 * client-side (`components/artifacts/document-list.tsx`); this page
 * only fetches the full, unfiltered set once.
 *
 * `dynamic = "force-dynamic"`: `listDocuments()` reads request-scoped
 * session and workspace state (`requireWorkspace()`, inside
 * `@/actions/documents`), so this page can only ever render per-request
 * — declaring that stops Next from attempting a static prerender that
 * would always fail at build time.
 */
export const dynamic = "force-dynamic";

export default async function ArtifactsPage() {
  const [t, result] = await Promise.all([
    getTranslations("artifacts"),
    listDocuments(),
  ]);

  return (
    <div className="container mx-auto space-y-8 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">{t("page.heading")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("page.description")}
        </p>
      </header>

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
