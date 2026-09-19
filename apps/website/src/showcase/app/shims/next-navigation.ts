/** Stand-in for `next/navigation` inside the preview. */
import { useContext } from "react";
import { PathnameContext } from "@showcase/i18n/navigation";

export { useRouter, usePathname, redirect } from "@showcase/i18n/navigation";

export function useSearchParams(): URLSearchParams {
  const href = useContext(PathnameContext);
  const at = href.indexOf("?");
  return new URLSearchParams(at === -1 ? "" : href.slice(at));
}

export function useParams(): Record<string, string> {
  return {};
}

export function notFound(): never {
  throw new Error("notFound() is not available in the preview");
}
