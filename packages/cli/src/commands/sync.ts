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
 *   so `upgrade --check` stops calling them customized;
 * - the app's copies: seams and message files wait under
 *   `.intelligo/sync-restore/` while the install runs, and a file of
 *   shadcn's own items (`utils`, `card`…) the install replaced is saved
 *   under `.intelligo/backup/` (`sync-guard.ts`).
 *
 * `--check` installs nothing and exits 1 when any installed file is
 * missing, edited or behind the registry — the gate CI runs.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { packageDir } from "../package-dir.js";
import { spawnCommand } from "../spawn-command.js";
import { backUp, backUpContents } from "./backup.js";
import {
  RESTORE_DIR,
  clearRestorePoint,
  leftRestorePoint,
  onInterrupt,
  snapshotUpstream,
  upstreamDirs,
  writeBack,
  writeRestorePoint,
} from "./sync-guard.js";
import { syncCheckExitCode, formatSyncReport } from "./sync-report.js";
export { syncCheckExitCode, formatSyncReport } from "./sync-report.js";

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
  messageEntry,
  messageHashes,
  restoreKept,
  type Json,
  type MessageHashes,
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
  /** a seam whose shipped default changed since the last sync */
  | "seam-changed"
  /** recorded by an earlier sync, but no item this app keeps ships it now */
  | "orphaned"
  /** a message file that lacks keys the registry's has, or holds its old text */
  | "messages-behind"
  /** the app reworded a message whose registry text changed or went; kept */
  | "messages-changed"
  /** the app's wording uses an argument the registry's text no longer passes */
  | "messages-arguments"
  /** another locale's copy of a shipped namespace lacks keys the app's English has */
  | "locale-behind";

export type SyncEntry = {
  item: string;
  path: string;
  state: SyncFileState;
  /**
   * For the `messages-*` states and `locale-behind`: the dotted keys
   * the state is about.
   */
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

export type ShippedFile = { item: string; target: string; content: string };

export function shippedFiles(
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
  const manifest = readManifest(context.appRoot);
  const recorded = manifest?.registry?.files ?? {};
  // What the scaffold wrote, by hash: a file it wrote and nobody edited
  // is the registry's to replace, not someone's work.
  const scaffolded = new Map(
    (manifest?.features[SCAFFOLD_FEATURE]?.files ?? []).map((f) => [
      f.path,
      f.hash,
    ])
  );

  const entries: SyncEntry[] = files.map(({ item, target, content }) => {
    const abs = path.join(context.appRoot, target);
    if (!existsSync(abs)) return { item, path: target, state: "missing" };
    if (target in seams) {
      const seen = manifest?.registry?.seams?.[target];
      return {
        item,
        path: target,
        state:
          seen !== undefined && seen !== hashContents(asInstalled(content))
            ? "seam-changed"
            : "seam",
      };
    }
    const local = readFileSync(abs, "utf8");

    if (isMessages(target)) {
      return messageEntry(
        item,
        target,
        JSON.parse(content) as Json,
        JSON.parse(local) as Json,
        manifest?.registry?.messages?.[target]
      );
    }

    if (asInstalled(local) === asInstalled(content)) {
      return { item, path: target, state: "current" };
    }
    const hash = recorded[target];
    if (hash === undefined) {
      return {
        item,
        path: target,
        state:
          scaffolded.get(target) === hashContents(local)
            ? "outdated"
            : "differs",
      };
    }
    return {
      item,
      path: target,
      state: hashContents(asInstalled(local)) === hash ? "outdated" : "edited",
    };
  });

  entries.push(...localeEntries(context.appRoot, files));
  // Checked against everything the app keeps, not only the items named:
  // a file another item ships is not left behind by this one.
  const known = [
    ...new Set([...(manifest?.registry?.items ?? []), ...items]),
  ].filter((name) => hasRegistryItem(context.registryDir, name));
  const kept = new Set(shippedFiles(context, known).files.map((f) => f.target));
  for (const target of Object.keys(recorded)) {
    if (!kept.has(target) && existsSync(path.join(context.appRoot, target))) {
      entries.push({ item: "", path: target, state: "orphaned" });
    }
  }
  return { version: context.frameworkVersion, items: closure, entries };
}

/** The package version the app resolves for `@intelligo-dev/core`, if any. */
export function installedFrameworkVersion(appRoot: string): string | null {
  const core = packageDir(appRoot, "@intelligo-dev/core");
  if (!core) return null;
  const manifest = path.join(core, "package.json");
  return (JSON.parse(readFileSync(manifest, "utf8")) as { version: string })
    .version;
}

function serveRegistry(dir: string): Promise<{ server: Server; url: string }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      let name = "";
      try {
        name = decodeURIComponent((req.url ?? "").split("?")[0]!).replace(
          /^\//,
          ""
        );
      } catch {
        // A malformed escape names no item: answered 404 below.
      }
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
    const spawned = spawnCommand(command, args);
    const child = spawn(spawned.command, spawned.args, {
      cwd,
      shell: spawned.shell,
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

/**
 * Write the synced items and each installed file's hash (seams and
 * message files aside) into the manifest.
 */
function recordSync(
  context: SyncContext,
  names: readonly string[],
  after: SyncReport,
  {
    manifest,
    shipped,
    seamTargets,
  }: {
    manifest: Manifest;
    shipped: ReadonlyMap<string, string>;
    seamTargets: Record<string, string>;
  }
): void {
  const files: Record<string, string> = {};
  const seams: Record<string, string> = {};
  const messages: Record<string, MessageHashes> = {};
  for (const [target, content] of shipped) {
    if (target in seamTargets) {
      seams[target] = hashContents(asInstalled(content));
    } else if (isMessages(target)) {
      messages[target] = messageHashes(JSON.parse(content) as Json);
    }
  }
  for (const e of after.entries) {
    if (
      e.state === "seam" ||
      e.state === "seam-changed" ||
      e.state === "missing" ||
      isMessages(e.path)
    ) {
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
    // The pages now match this release, so the app is on it.
    frameworkVersion: context.frameworkVersion,
    registry: {
      version: context.frameworkVersion,
      items: installOrder([...recordedItems], context.requires),
      files: { ...manifest.registry?.files, ...files },
      seams: { ...manifest.registry?.seams, ...seams },
      messages: { ...manifest.registry?.messages, ...messages },
    },
  });
}

/**
 * Record `names` as items this app keeps in sync before any is
 * installed, so a bare `intelligo sync` installs them after an install
 * that did not run or did not finish.
 */
export function recordItems(
  names: readonly string[],
  context: Pick<SyncContext, "appRoot" | "requires" | "frameworkVersion">
): void {
  const manifest =
    readManifest(context.appRoot) ?? emptyManifest(context.frameworkVersion);
  const items = new Set([...(manifest.registry?.items ?? []), ...names]);
  writeManifest(context.appRoot, {
    ...manifest,
    registry: {
      ...manifest.registry,
      version: manifest.registry?.version ?? context.frameworkVersion,
      items: installOrder([...items], context.requires),
      files: manifest.registry?.files ?? {},
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

  const left = leftRestorePoint(appRoot);
  if (left.length > 0) {
    log(
      [
        `An earlier sync did not finish: the app's copies of these files are under ${RESTORE_DIR}:`,
        ...left.map((file) => `  ${file}`),
        "",
        `Put back the ones the install replaced, then delete ${RESTORE_DIR} and re-run.`,
      ].join("\n")
    );
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
  if (edited.length > 0 && options.force) {
    const dir = backUp(
      appRoot,
      edited.map((e) => e.path)
    );
    log(`Backed up ${edited.length} file(s) --force replaces to ${dir}`);
  }
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

  const componentsRaw = readFileSync(componentsPath, "utf8");
  const componentsBefore = JSON.parse(componentsRaw) as {
    registries?: Record<string, string>;
    tailwind?: { css?: string };
    aliases?: Record<string, string>;
  };
  // The scaffold's files as they are now, to see which the install replaces.
  const scaffold = snapshotScaffold(appRoot);
  // shadcn's own items' files, which no check here covers.
  const upstream = snapshotUpstream(
    appRoot,
    upstreamDirs(componentsBefore.aliases),
    new Set([...shippedTargets, ...Object.keys(seams)])
  );
  const originalRegistry = componentsBefore.registries?.["@intelligo"];

  // Until the install is over, the app's own copies wait on disk too,
  // and an interrupt puts them back.
  const restorePoint = new Map([...kept, ["components.json", componentsRaw]]);
  writeRestorePoint(appRoot, restorePoint);
  let server: Server | null = null;
  const disposeInterrupt = onInterrupt(() => {
    server?.close();
    writeBack(appRoot, restorePoint);
    clearRestorePoint(appRoot);
    log(
      "sync interrupted: the app's seams, messages and components.json are back as they were."
    );
  });

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
  const shipped = new Map(
    shippedFiles(context, items).files.map((f) => [f.target, f.content])
  );
  try {
    const served = await serveRegistry(context.registryDir);
    server = served.server;
    setRegistry(`${served.url}/{name}.json`);
    for (const item of items) {
      log(`› shadcn add ${item}`);
      const result = await run(
        shadcn,
        ["add", `${served.url}/${item}.json`, "--yes", "--overwrite"],
        appRoot
      );
      if (result.code !== 0) {
        failed = { item, output: result.output };
        break;
      }
    }
  } finally {
    disposeInterrupt();
    setRegistry(originalRegistry);
    server?.close();
    // Seams back as they were; messages merged over the registry's.
    restoreKept(
      appRoot,
      kept,
      shipped,
      readManifest(appRoot)?.registry?.messages ?? {}
    );
    clearRestorePoint(appRoot);
  }

  const replaced = upstream.replaced();
  if (replaced.size > 0) {
    const dir = backUpContents(appRoot, replaced);
    log(
      [
        `shadcn replaced ${replaced.size} file(s) of its own items; the app's copies are in ${dir}:`,
        ...[...replaced.keys()].map((file) => `  ${file}`),
      ].join("\n")
    );
  }

  if (failed) {
    log(
      `shadcn add ${failed.item} failed:\n${failed.output.trim().split("\n").slice(-20).join("\n")}`
    );
    return 1;
  }

  // Record what is on disk now, so the next check can tell an edit.
  const after = syncCheck(items, context);
  recordSync(context, names, after, {
    shipped,
    seamTargets: seams,
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
