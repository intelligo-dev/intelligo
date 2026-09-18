/**
 * The install command, spelled once. Every surface that shows how to add
 * a registry item or a primitive builds it here, so the homepage, the
 * block pages, the explorer and the catalog cannot drift apart: run
 * inside the generated app, where `shadcn` is already a dependency.
 */
const REGISTRY = "https://intelligo.dev/r";

/** `name` is a registry item (`chat`), or a stock shadcn primitive when `stock` is set. */
export function installCommand(name: string, { stock = false } = {}): string {
  return `pnpm exec shadcn add ${stock ? name : `${REGISTRY}/${name}.json`}`;
}
