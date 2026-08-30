/**
 * Stand-in for the consumer's `@/i18n/navigation` (next-intl's typed
 * Link/router). In the preview a link is an anchor and navigation is a
 * no-op that records where the component wanted to go.
 */
import { createContext, forwardRef, useContext, type AnchorHTMLAttributes, type ReactNode } from "react";

type Href = string | { pathname: string; query?: Record<string, string | number> };

export const PathnameContext = createContext<string>("/dashboard");
export const NavigateContext = createContext<(href: string) => void>(() => {});

export function ShowcaseNavigation({ pathname, onNavigate, children }: { pathname: string; onNavigate?: (href: string) => void; children: ReactNode }) {
  return (
    <PathnameContext.Provider value={pathname}>
      <NavigateContext.Provider value={onNavigate ?? (() => {})}>{children}</NavigateContext.Provider>
    </PathnameContext.Provider>
  );
}

function toString(href: Href): string {
  if (typeof href === "string") return href;
  const q = href.query ? "?" + new URLSearchParams(Object.entries(href.query).map(([k, v]) => [k, String(v)])).toString() : "";
  return href.pathname + q;
}

export const Link = forwardRef<HTMLAnchorElement, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: Href; locale?: string; prefetch?: boolean }>(
  function Link({ href, locale: _locale, prefetch: _prefetch, onClick, children, ...rest }, ref) {
    const navigate = useContext(NavigateContext);
    const target = toString(href);
    return (
      <a
        ref={ref}
        href={target}
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) {
            e.preventDefault();
            navigate(target);
          }
        }}
        {...rest}
      >
        {children}
      </a>
    );
  }
);

export function useRouter() {
  const navigate = useContext(NavigateContext);
  return {
    push: (href: Href) => navigate(toString(href)),
    replace: (href: Href) => navigate(toString(href)),
    refresh: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  };
}

export function usePathname(): string {
  return useContext(PathnameContext);
}

export function redirect(_href: Href): never {
  throw new Error("redirect() is not available in the preview");
}

export function getPathname({ href }: { href: Href; locale?: string }): string {
  return toString(href);
}
