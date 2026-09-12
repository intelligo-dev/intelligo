#!/usr/bin/env node
/**
 * Copies packages/registry/requires.json into templates/, where a
 * published `intelligo doctor` reads it (doctor.ts, bundledRequires).
 *
 * The registry's file is the contract; this copy is what ships in the
 * tarball. It is regenerated on every build and committed, because CI
 * runs doctor from source before anything is built — and
 * tests/architecture/registry.test.ts fails if the commit is stale.
 *
 * A relative path rather than a workspace dependency: the CLI declares
 * no @intelligo-dev/* edge at all (dependency-direction), so that
 * `doctor` never needs the application to boot before it can say why
 * the application cannot boot. Outside the monorepo — a packed
 * tarball — the source is absent and the committed copy stands.
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = resolve(here, "../../registry/requires.json");
const target = resolve(here, "../templates/registry-requires.json");

if (existsSync(source)) copyFileSync(source, target);
