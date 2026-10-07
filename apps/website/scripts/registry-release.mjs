/**
 * How the hosted registry keeps releases apart: each release's items sit
 * under /r/<version>/ and name the components they build on in that same
 * release, while /r/*.json, what the `@intelligo` namespace resolves,
 * names them through the namespace.
 */
export const REGISTRY_URL = "https://intelligo.dev/r";

/** Semver precedence: negative when `a` comes before `b`. */
export function compareVersions(a, b) {
  const parse = (v) => {
    const dash = v.indexOf("-");
    const core = dash === -1 ? v : v.slice(0, dash);
    const pre = dash === -1 ? [] : v.slice(dash + 1).split(".");
    return { core: core.split(".").map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) {
    if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  }
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i];
    const q = y.pre[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    if (p === q) continue;
    const pn = /^\d+$/.test(p);
    const qn = /^\d+$/.test(q);
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

/** A built item as its release's copy: `@intelligo/<x>` names `/r/<release>/<x>.json`. */
export function toRelease(text, release) {
  return text.replace(
    /"@intelligo\/([a-z0-9-]+)"/g,
    (_, name) => `"${REGISTRY_URL}/${release}/${name}.json"`
  );
}

/** A release's copy as the namespace serves it: the inverse of toRelease. */
export function fromRelease(text, release) {
  const prefix = `"${REGISTRY_URL}/${release}/`.replace(
    /[.*+?^${}()|[\]\\/]/g,
    "\\$&"
  );
  return text.replace(
    new RegExp(`${prefix}([a-z0-9-]+)\\.json"`, "g"),
    (_, name) => `"@intelligo/${name}"`
  );
}
