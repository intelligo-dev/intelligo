/**
 * Writes dist/_headers, the response headers Cloudflare serves the
 * static assets with, after the build: a content security policy that
 * allows the inline scripts the build emitted by their hashes (so a
 * script nobody wrote does not run), refuses framing, and keeps the
 * hosted registry fetchable from anywhere as JSON.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

function htmlFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (name.endsWith(".html")) out.push(p);
  }
  return out;
}

/** The sha256 source of every inline script a page executes; JSON-LD and other data blocks are not scripts. */
export function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const [, attrs, body] of html.matchAll(
    /<script\b([^>]*)>([\s\S]*?)<\/script>/g
  )) {
    if (/\bsrc=/.test(attrs)) continue;
    const type = /\btype="([^"]*)"/.exec(attrs)?.[1];
    if (type && type !== "module" && !/javascript/.test(type)) continue;
    hashes.add(
      `'sha256-${createHash("sha256").update(body).digest("base64")}'`
    );
  }
  return hashes;
}

export function contentSecurityPolicy(hashes) {
  return [
    "default-src 'self'",
    // WebAssembly compiles the code highlighter's regular-expression engine.
    `script-src 'self' 'wasm-unsafe-eval' ${[...hashes].sort().join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    // The star count in the nav; the demos read files the reader attached.
    "connect-src 'self' blob: data: https://api.github.com",
    "worker-src 'self' blob:",
    "frame-src 'self' blob: data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function headersFile(hashes) {
  return [
    "/*",
    `  Content-Security-Policy: ${contentSecurityPolicy(hashes)}`,
    "  X-Content-Type-Options: nosniff",
    "  X-Frame-Options: DENY",
    "  Referrer-Policy: strict-origin-when-cross-origin",
    "",
    // The shadcn CLI and browser tools read these from any origin.
    "/r/*",
    "  Content-Type: application/json; charset=utf-8",
    "  Access-Control-Allow-Origin: *",
    "",
  ].join("\n");
}

export default function securityHeaders() {
  return {
    name: "intelligo-headers",
    hooks: {
      "astro:build:done": ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        const hashes = new Set();
        for (const file of htmlFiles(root)) {
          for (const h of inlineScriptHashes(readFileSync(file, "utf8")))
            hashes.add(h);
        }
        writeFileSync(join(root, "_headers"), headersFile(hashes));
        logger.info(`_headers written, ${hashes.size} inline scripts allowed`);
      },
    },
  };
}
