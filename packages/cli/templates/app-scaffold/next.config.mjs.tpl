import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Intelligo packages ship TypeScript source, so Next compiles them
  // with your app.
  transpilePackages: [
    "@intelligo-dev/admin",
    "@intelligo-dev/audit",
    "@intelligo-dev/auth",
    "@intelligo-dev/billing",
    "@intelligo-dev/core",
    "@intelligo-dev/executions",
  ],
};

export default withNextIntl(nextConfig);
