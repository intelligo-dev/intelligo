/** Stand-in for `next/navigation` inside the preview. */
export { useRouter, usePathname, redirect } from "@showcase/i18n/navigation";

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function useParams(): Record<string, string> {
  return {};
}

export function notFound(): never {
  throw new Error("notFound() is not available in the preview");
}
