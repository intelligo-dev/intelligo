/**
 * Stand-in for the consumer's `@/i18n/navigation` (next-intl's typed
 * Link/router) — adapted from apps/website/src/showcase/app/i18n/navigation.tsx,
 * which proved this same shim outside Next.js. The film has one route it
 * ever shows ("/dashboard"), so navigation is a no-op: a click on a
 * sidebar item cannot happen in a rendered video anyway.
 */
import {
  createContext,
  forwardRef,
  useContext,
  type AnchorHTMLAttributes,
} from "react";

type Href =
  string | { pathname: string; query?: Record<string, string | number> };

export const PathnameContext = createContext<string>("/dashboard");

function toString(href: Href): string {
  if (typeof href === "string") return href;
  const q = href.query
    ? "?" +
      new URLSearchParams(
        Object.entries(href.query).map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  return href.pathname + q;
}

export const Link = forwardRef<
  HTMLAnchorElement,
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
    href: Href;
    locale?: string;
    prefetch?: boolean;
  }
>(function Link({ href, locale: _locale, prefetch: _prefetch, ...rest }, ref) {
  return <a ref={ref} href={toString(href)} {...rest} />;
});

export function useRouter() {
  return {
    push: (_href: Href, _opts?: { locale?: string }) => {},
    replace: (_href: Href, _opts?: { locale?: string }) => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  };
}

export function usePathname(): string {
  return useContext(PathnameContext).split("?")[0]!;
}

export function redirect(_href: Href): never {
  throw new Error("redirect() is not available in the film");
}

export function getPathname({ href }: { href: Href; locale?: string }): string {
  return toString(href);
}
