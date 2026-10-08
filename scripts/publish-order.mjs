#!/usr/bin/env node
// Prints the published workspaces under packages/, one directory per
// line, each after every @intelligo-dev package it depends on: the order
// the release publishes them in, so a version on npm never names a
// sibling version that is not there yet. Private workspaces are left
// out; a dependency cycle is an error.

import { existsSync, readdirSync, readFileSync } from "node:fs";

const packages = new URL("../packages/", import.meta.url);

const workspaces = new Map();
for (const dir of readdirSync(packages).sort()) {
  const file = new URL(`${dir}/package.json`, packages);
  if (!existsSync(file)) continue;
  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.private === true) continue;
  workspaces.set(manifest.name, { dir, manifest });
}

const order = [];
const state = new Map();
function visit(name, path) {
  if (state.get(name) === "done") return;
  if (state.get(name) === "visiting") {
    console.error(`dependency cycle: ${[...path, name].join(" → ")}`);
    process.exit(1);
  }
  state.set(name, "visiting");
  const { manifest, dir } = workspaces.get(name);
  const deps = new Set(
    ["dependencies", "peerDependencies", "optionalDependencies"].flatMap(
      (field) => Object.keys(manifest[field] ?? {})
    )
  );
  for (const dep of [...deps].sort()) {
    if (workspaces.has(dep)) visit(dep, [...path, name]);
  }
  state.set(name, "done");
  order.push(`packages/${dir}`);
}
for (const name of workspaces.keys()) visit(name, []);

console.log(order.join("\n"));
