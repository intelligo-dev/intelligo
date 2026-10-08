/**
 * The install itself: every item through `shadcn add --overwrite`, from
 * the bundled registry served on 127.0.0.1 for the length of it.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";

import { spawnCommand } from "../spawn-command.js";
import {
  clearRestorePoint,
  onInterrupt,
  writeBack,
  writeRestorePoint,
} from "./sync-guard.js";

export type InstallInput = {
  appRoot: string;
  /** The app's shadcn binary. */
  shadcn: string;
  registryDir: string;
  items: readonly string[];
  log: (line: string) => void;
  /**
   * The app's files the install may replace, by app-relative path. They
   * wait under the restore point while it runs and are written back as
   * they were if the process is interrupted.
   */
  restorePoint: ReadonlyMap<string, string>;
  /** Runs once the install is over, whether or not every item went in. */
  settle: () => void;
};

/** Installs the items in order; the first that fails, or null. */
export async function installItems(
  input: InstallInput
): Promise<{ item: string; output: string } | null> {
  const { appRoot, log } = input;
  const componentsPath = path.join(appRoot, "components.json");
  const originalRegistry = (
    JSON.parse(readFileSync(componentsPath, "utf8")) as {
      registries?: Record<string, string>;
    }
  ).registries?.["@intelligo"];

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

  writeRestorePoint(appRoot, input.restorePoint);
  let server: Server | null = null;
  const disposeInterrupt = onInterrupt(() => {
    server?.close();
    writeBack(appRoot, input.restorePoint);
    clearRestorePoint(appRoot);
    log(
      "sync interrupted: the app's seams, messages and components.json are back as they were."
    );
  });

  try {
    const served = await serveRegistry(input.registryDir);
    server = served.server;
    setRegistry(`${served.url}/{name}.json`);
    for (const item of input.items) {
      log(`› shadcn add ${item}`);
      const result = await run(
        input.shadcn,
        ["add", `${served.url}/${item}.json`, "--yes", "--overwrite"],
        appRoot
      );
      if (result.code !== 0) return { item, output: result.output };
    }
    return null;
  } finally {
    disposeInterrupt();
    setRegistry(originalRegistry);
    server?.close();
    input.settle();
    clearRestorePoint(appRoot);
  }
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
