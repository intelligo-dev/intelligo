import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Intelligo packages ship TypeScript source, so Next compiles them
  // with your app.
  transpilePackages: [
    "@intelligo/admin",
    "@intelligo/audit",
    "@intelligo/auth",
    "@intelligo/billing",
    "@intelligo/core",
    "@intelligo/executions",
  ],
};

export default withNextIntl(nextConfig);
