/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { join } from "node:path";
import { Config } from "@remotion/cli/config";
import { enableTailwind } from "@remotion/tailwind-v4";

// Neither import.meta.url nor __dirname identifies this file's own
// location — Remotion loads remotion.config.ts through a bundler
// context whose __dirname resolves inside its own package, not here.
// Every render/studio command (package.json's scripts, this doc's own)
// runs with tools/film as the working directory, same as the relative
// entry point (`src/index.ts`) they already pass.
const SRC = join(process.cwd(), "src");

Config.setRspack(true);
// "jpeg" (the scaffold's default) captures frames full-range, which
// libx264 then tags as yuvj420p — a pixel format QuickTime refuses to
// open at all. "png" captures losslessly at standard (limited) range,
// so the encode comes out yuv420p and plays everywhere.
Config.setVideoImageFormat("png");
Config.setPixelFormat("yuv420p");
Config.setOverwriteOutput(true);
Config.overrideBundlerConfig((config) => {
  const withTailwind = enableTailwind(config);
  return {
    ...withTailwind,
    resolve: {
      ...withTailwind.resolve,
      // Mirrors tsconfig.json's "@ui/*" path — the real app-shell/chat
      // components sync-ui.mjs copies into src/ui, imported the same
      // way they import each other (@/… → @ui/…, see that script).
      alias: {
        ...withTailwind.resolve?.alias,
        "@ui": join(SRC, "ui"),
      },
    },
  };
});
