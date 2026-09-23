/**
 * `intelligo sync [items…] [--check] [--force]`
 *
 * Keeps an app's installed registry pages exactly what the framework
 * ships. Installing stays the shadcn CLI's job — every item goes in with
 * `shadcn add <item> --yes --overwrite` — and this command adds what
 * shadcn cannot know:
 *
 * - the version: items come from the registry bundled with this CLI, so
 *   they match the `@intelligo-dev/*` packages of the same release;
 * - the order: an item that imports a sibling's files lands after it
 *   (requires.json `items`);
 * - the seams: files an item ships once for the deployment to own
 *   (requires.json `seams`) are put back after the install, and message
 *   files are merged key by key, the app's copy winning;
 * - the record: intelligo.manifest.json keeps each installed file's
 *   hash, so `--check` can tell a file edited by hand from one a newer
 *   registry replaced. Scaffold files an install replaces (globals.css,
 *   the theme provider) leave the `app-scaffold` record for this one,
 *   so `upgrade --check` stops calling them customized.
 *
 * `--check` installs nothing and exits 1 when any installed file is
 * missing, edited or behind the registry — the gate CI runs.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import type { RegistryRequires } from "./doctor.js";
import {
  emptyManifest,
  handOver,
  hashContents,
  readManifest,
  writeManifest,
  type Manifest,
} from "../manifest.js";
import {
  asInstalled,
  hasRegistryItem,
  installedPath,
  readRegistryItem,
  registryClosure,
} from "../registry-bundle.js";
import { withDependencies } from "../registry-items.js";
import {
  isMessages,
  localeEntries,
  mergeMessages,
  missingMessageKeys,
  type Json,
} from "./sync-messages.js";
import { SCAFFOLD_FEATURE, snapshotScaffold } from "./sync-scaffold.js";

export {
  appLocales,
  mergeMessages,
  missingMessageKeys,
} from "./sync-messages.js";
export { SCAFFOLD_FEATURE, scaffoldHandover } from "./sync-scaffold.js";

/** The design-system base: no marker file, installed before any page. */
export const BASE_ITEM = "intelligo";

export type SyncFileState =
  /** identical to the registry */
  | "current"
  /** untouched since the last sync; the registry has a newer version */
  | "outdated"
  /** changed by hand since it was installed */
  | "edited"
  /** differs from the registry, and no sync ever recorded it */
  | "differs"
  /** the registry ships it and the app does not have it */
  | "missing"
  /** a seam: the app's own from the first install on */
  | "seam"
  /** a message file that lacks keys the registry's has */
  | "messages-behind"
  /** another locale's copy of a shipped namespace lacks keys the app's English has */
  | "locale-behind";

export type SyncEntry = {
  item: string;
  path: string;
  state: SyncFileState;
  /** For `messages-behind` / `locale-behind`: the dotted keys the copy lacks. */
  missingKeys?: string[];
};

export type SyncReport = {
  /** The framework version of the bundled registry. */
  version: string;
  /** The items checked, in install order (Intelligo components included). */
  items: string[];
  entries: SyncEntry[];
};

export type SyncSelection =
  { ok: true; items: string[] } | { ok: false; message: string };

export type SyncContext = {
  appRoot: string;
  registryDir: string;
  requires: RegistryRequires & { seams?: Record<string, string> };
  frameworkVersion: string;
};

const FAILING: ReadonlySet<SyncFileState> = new Set([
  "outdated",
  "edited",
  "differs",
  "missing",
  "messages-behind",
  "locale-behind",
]);

/**
 * The items to sync: the ones named, else the ones the manifest
 * recorded. With neither, nothing is guessed — a page at an item's
 * marker path may be the product's own (a custom dashboard), and a sync
 * would replace it — so the message lists what looks installed and asks
 * for names.
 */
export function selectItems(
  names: readonly string[],
  context: SyncContext
): SyncSelection {
  const unknown = names.filter(
    (n) => n === "registry" || !hasRegistryItem(context.registryDir, n)
  );
  if (unknown.length > 0) {
    return {
      ok: false,
      message: `Unknown registry item(s): ${unknown.join(", ")}. Available: ${[
        BASE_ITEM,
        ...Object.keys(context.requires.items),
      ].join(", ")}`,
    };
  }
  if (names.length > 0) return { ok: true, items: [...names] };

  const recorded = readManifest(context.appRoot)?.registry?.items;
  if (recorded && recorded.length > 0) return { ok: true, items: recorded };

  const looksInstalled = Object.entries(context.requires.items)
    .filter(([, item]) => existsSync(path.join(context.appRoot, item.marker)))
    .map(([name]) => name);
  return {
    ok: false,
    message: [
      "No synced items are recorded in intelligo.manifest.json yet.",
      "Name the items this app installs from the registry, once:",
      "",
      `  intelligo sync ${[BASE_ITEM, ...looksInstalled].join(" ")}`,
      "",
      "(these are the items whose files are present — leave out any whose",
      "path your product uses for a page of its own)",
    ].join("\n"),
  };
}

/** Blocks in requires.json order, the design-system base first. */
export function installOrder(
  items: readonly string[],
  requires: RegistryRequires
): string[] {
  const blocks = items.filter((n) => n in requires.items);
  const others = items.filter((n) => !(n in requires.items));
  const ordered = withDependencies(blocks, requires);
  return [
    ...others.filter((n) => n === BASE_ITEM),
    ...others.filter((n) => n !== BASE_ITEM),
    ...ordered,
  ];
}

type ShippedFile = { item: string; target: string; content: string };

function shippedFiles(
  context: SyncContext,
  items: readonly string[]
): {
  closure: string[];
  files: ShippedFile[];
} {
  const closure = registryClosure(context.registryDir, items);
  const byTarget = new Map<string, ShippedFile>();
  for (const name of closure) {
    const item = readRegistryItem(context.registryDir, name);
    for (const file of item.files ?? []) {
      const target = installedPath(item, file);
      if (!target || file.content === undefined) continue;
      byTarget.set(target, { item: name, target, content: file.content });
    }
  }
  return { closure, files: [...byTarget.values()] };
}

/** Compare the app against the bundled registry; writes nothing. */
export function syncCheck(
  items: readonly string[],
  context: SyncContext
): SyncReport {
  const { closure, files } = shippedFiles(context, items);
  const seams = context.requires.seams ?? {};
  const recorded = readManifest(context.appRoot)?.registry?.files ?? {};

  const entries: SyncEntry[] = files.map(({ item, target, content }) => {
    const abs = path.join(context.appRoot, target);
    if (!existsSync(abs)) return { item, path: target, state: "missing" };
    if (target in seams) return { item, path: target, state: "seam" };
    const local = readFileSync(abs, "utf8");

    if (isMessages(target)) {
      const missingKeys = missingMessageKeys(
        JSON.parse(content) as Json,
        JSON.parse(local) as Json
      );
      return missingKeys.length > 0
        ? { item, path: target, state: "messages-behind", missingKeys }
        : { item, path: target, state: "current" };
    }

    if (asInstalled(local) === asInstalled(content)) {
      return { item, path: target, state: "current" };
    }
    const hash = recorded[target];
    if (hash === undefined) return { item, path: target, state: "differs" };
    return {
      item,
      path: target,
      state: hashContents(asInstalled(local)) === hash ? "outdated" : "edited",
    };
  });

  entries.push(...localeEntries(context.appRoot, files));
  return { version: context.frameworkVersion, items: closure, entries };
}

export function syncCheckExitCode(report: SyncReport): number {
  return report.entries.some((e) => FAILING.has(e.state)) ? 1 : 0;
}

export function formatSyncReport(report: SyncReport): string {
  const counts = new Map<SyncFileState, number>();
  for (const e of report.entries) {
    counts.set(e.state, (counts.get(e.state) ?? 0) + 1);
  }
  const lines = [
    `Registry ${report.version}: ${report.items.length} item(s), ${report.entries.length} file(s) — ` +
      [...counts].map(([state, n]) => `${n} ${state}`).join(", "),
  ];
  const HINT: Partial<Record<SyncFileState, string>> = {
    outdated: "a newer registry version — `intelligo sync` replaces it",
    edited:
      "edited by hand — move the change into a seam, or ask for one upstream",
    differs: "not what the registry ships, and never synced",
    missing: "not installed",
    "messages-behind": "lacks registry keys — `intelligo sync` adds them",
    "locale-behind":
      "lacks keys the app's English copy has — translate them; sync never writes another locale",
  };
  for (const state of FAILING) {
    const group = report.entries.filter((e) => e.state === state);
    if (group.length === 0) continue;
    lines.push("", `${state} (${HINT[state]}):`);
    for (const e of group) {
      const keys = e.missingKeys
        ? ` — ${e.missingKeys.slice(0, 5).join(", ")}${e.missingKeys.length > 5 ? `, +${e.missingKeys.length - 5}` : ""}`
        : "";
      lines.push(`  ${e.path}  [${e.item}]${keys}`);
    }
  }
  if (!report.entries.some((e) => FAILING.has(e.state))) {
    lines.push("✓ every installed file is the registry's, seams aside");
  }
  return lines.join("\n");
}

/** The package version the app resolves for `@intelligo-dev/core`, if any. */
export function installedFrameworkVersion(appRoot: string): string | null {
  const manifest = path.join(
    appRoot,
    "node_modules",
    "@intelligo-dev",
    "core",
    "package.json"
  );
  if (!existsSync(manifest)) return null;
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string })
    .version;
}

function serveRegistry(dir: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const name = decodeURIComponent((req.url ?? "").split("?")[0]!).replace(
        /^\//,
        ""
      );
      const file = path.join(dir, name);
      if (!/^[a-z0-9-]+\.json$/.test(name) || !existsSync(file)) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(readFileSync(file));
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function run(
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      // pnpm, npx and friends are .cmd shims on Windows.
      shell: process.platform === "win32",
      env: process.env,
    });
    let output = "";
    child.stdout.on("data", (d) => (output += String(d)));
    child.stderr.on("data", (d) => (output += String(d)));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
    child.on("error", (error) =>
      resolve({ code: 1, output: `${output}${error.message}` })
    );
  });
}

/** Put the kept seams back, and merge kept messages over the registry's. */
function restoreKept(
  appRoot: string,
  kept: ReadonlyMap<string, string>,
  shipped: ReadonlyMap<string, string>
): void {
  for (const [target, content] of kept) {
    const abs = path.join(appRoot, target);
    mkdirSync(path.dirname(abs), { recursive: true });
    if (isMessages(target) && shipped.has(target)) {
      const merged = mergeMessages(
        JSON.parse(shipped.get(target)!) as Json,
        JSON.parse(content) as Json
      );
      writeFileSync(abs, `${JSON.stringify(merged, null, 2)}\n`);
    } else {
      writeFileSync(abs, content);
    }
  }
}

/**
 * Write the synced items and each installed file's hash (seams and
 * message files aside) into the manifest.
 */
function recordSync(
  context: SyncContext,
  names: readonly string[],
  after: SyncReport,
  { manifest }: { manifest: Manifest }
): void {
  const files: Record<string, string> = {};
  for (const e of after.entries) {
    if (e.state === "seam" || e.state === "missing" || isMessages(e.path)) {
      continue;
    }
    files[e.path] = hashContents(
      asInstalled(readFileSync(path.join(context.appRoot, e.path), "utf8"))
    );
  }
  const recordedItems = new Set([
    ...(manifest.registry?.items ?? []),
    ...names,
  ]);
  writeManifest(context.appRoot, {
    ...manifest,
    registry: {
      version: context.frameworkVersion,
      items: installOrder([...recordedItems], context.requires),
      files: { ...manifest.registry?.files, ...files },
    },
  });
}

export type SyncApplyOptions = {
  force?: boolean;
  log?: (line: string) => void;
};

/**
 * Install `items` from the bundled registry, keep the seams, merge the
 * messages and record what was written. Refuses to overwrite a file
 * edited by hand unless `force` — the edit belongs in a seam, and the
 * refusal says which files.
 */
export async function syncApply(
  names: readonly string[],
  context: SyncContext,
  options: SyncApplyOptions = {}
): Promise<number> {
  const log = options.log ?? console.log;
  const { appRoot } = context;
  const shadcn = path.join(appRoot, "node_modules", ".bin", "shadcn");
  if (!existsSync(shadcn)) {
    log(
      "shadcn is not installed in this app — add it as a devDependency (the scaffold declares it) and install."
    );
    return 1;
  }
  const componentsPath = path.join(appRoot, "components.json");
  if (!existsSync(componentsPath)) {
    log("No components.json — run from the app's root.");
    return 1;
  }

  const items = installOrder(names, context.requires);
  const before = syncCheck(items, context);
  const shippedTargets = new Set(
    shippedFiles(context, items).files.map((f) => f.target)
  );
  const edited = before.entries.filter(
    (e) => e.state === "edited" || e.state === "differs"
  );
  if (edited.length > 0 && !options.force) {
    log(
      [
        `${edited.length} installed file(s) differ from the registry and would be overwritten:`,
        ...edited.map((e) => `  ${e.path}  [${e.item}]`),
        "",
        "Move what the change does into a seam (lib/*-config, messages/), then re-run",
        "with --force to replace these files with the registry's.",
      ].join("\n")
    );
    return 1;
  }

  // What the install must not lose: the app's seams and message files.
  const seams = context.requires.seams ?? {};
  const kept = new Map<string, string>();
  for (const e of before.entries) {
    if (e.state === "missing" || !shippedTargets.has(e.path)) continue;
    if (e.path in seams || isMessages(e.path)) {
      kept.set(e.path, readFileSync(path.join(appRoot, e.path), "utf8"));
    }
  }

  const componentsBefore = JSON.parse(readFileSync(componentsPath, "utf8")) as {
    registries?: Record<string, string>;
    tailwind?: { css?: string };
  };
  // The scaffold's files as they are now, to see which the install replaces.
  const scaffold = snapshotScaffold(appRoot);
  const originalRegistry = componentsBefore.registries?.["@intelligo"];
  const { server, url } = await serveRegistry(context.registryDir);

  const setRegistry = (value: string | undefined) => {
    // Read fresh: the base item rewrites components.json's style fields,
    // and those changes are the point — only the registry URL is ours.
    const current = JSON.parse(readFileSync(componentsPath, "utf8")) as {
      registries?: Record<string, string>;
    };
    const registries = { ...current.registries };
    if (value === undefined) delete registries["@intelligo"];
    else registries["@intelligo"] = value;
    const next: typeof current = { ...current, registries };
    if (Object.keys(registries).length === 0) delete next.registries;
    writeFileSync(componentsPath, `${JSON.stringify(next, null, 2)}\n`);
  };

  let failed: { item: string; output: string } | null = null;
  try {
    setRegistry(`${url}/{name}.json`);
    for (const item of items) {
      log(`› shadcn add ${item}`);
      const result = await run(
        shadcn,
        ["add", `${url}/${item}.json`, "--yes", "--overwrite"],
        appRoot
      );
      if (result.code !== 0) {
        failed = { item, output: result.output };
        break;
      }
    }
  } finally {
    setRegistry(originalRegistry);
    server.close();
  }

  // Seams back as they were; messages merged over the registry's.
  const shipped = new Map(
    shippedFiles(context, items).files.map((f) => [f.target, f.content])
  );
  restoreKept(appRoot, kept, shipped);

  if (failed) {
    log(
      `shadcn add ${failed.item} failed:\n${failed.output.trim().split("\n").slice(-20).join("\n")}`
    );
    return 1;
  }

  // Record what is on disk now, so the next check can tell an edit.
  const after = syncCheck(items, context);
  recordSync(context, names, after, {
    manifest: handOver(
      readManifest(appRoot) ?? emptyManifest(context.frameworkVersion),
      SCAFFOLD_FEATURE,
      scaffold.handedOver({
        shipped: new Set(shipped.keys()),
        seams,
        css: items.includes(BASE_ITEM)
          ? (componentsBefore.tailwind?.css ?? null)
          : null,
      })
    ),
  });

  log(formatSyncReport(after));
  return syncCheckExitCode(after);
}
