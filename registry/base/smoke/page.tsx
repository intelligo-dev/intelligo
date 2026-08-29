import { getTranslations } from "next-intl/server";

import { SmokeCard } from "@/components/smoke/smoke-card";

export default async function RegistrySmokePage() {
  const t = await getTranslations("smoke");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">{t("heading")}</h1>
      <SmokeCard />
    </main>
  );
}
