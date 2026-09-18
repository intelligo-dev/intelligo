/**
 * Everything a registry item needs around it to render outside Next.js:
 * the item's own messages (namespace = item name, exactly as the
 * consumer's i18n/request.ts merges them), a pathname for active-link
 * state, and a toaster for the actions that report through sonner.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IntlProvider } from "use-intl";
import { Toaster } from "sonner";
import { ShowcaseNavigation } from "@showcase/i18n/navigation";

const files = import.meta.glob("./app/messages/en/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Record<string, unknown>>;

export const MESSAGES: Record<string, unknown> = Object.fromEntries(
  Object.entries(files).map(([path, json]) => [
    path
      .split("/")
      .pop()!
      .replace(/\.json$/, ""),
    json,
  ])
);

export function ShowcaseProvider({
  pathname,
  toaster = true,
  children,
}: {
  pathname: string;
  /** Off where one page mounts many scenes and a single Toaster of its own. */
  toaster?: boolean;
  children: ReactNode;
}) {
  const [path, setPath] = useState(pathname);
  useEffect(() => setPath(pathname), [pathname]);
  return (
    <IntlProvider
      locale="en"
      timeZone="UTC"
      now={new Date("2026-08-29T09:00:00Z")}
      messages={MESSAGES}
      onError={() => {}}
      getMessageFallback={({ key }) => key.split(".").pop() ?? key}
    >
      <ShowcaseNavigation pathname={path} onNavigate={(href) => setPath(href)}>
        {children}
        {toaster && <Toaster position="bottom-right" richColors closeButton />}
      </ShowcaseNavigation>
    </IntlProvider>
  );
}

/**
 * A fixed-size canvas scaled to fit its container, so a full-width page
 * reads at frame size without touching the components' own layout.
 *
 * The scene is a picture of a page, not a page: it is `inert`, so the
 * fake sign-in form is not in the tab order and a screen reader is not
 * read an application that does nothing. It stays hidden until the first
 * measurement, so it never paints at a guessed scale and then jumps.
 *
 * On a phone the components already lay themselves out for the real
 * viewport (their breakpoints are media queries), so a 1180px canvas
 * would be a mobile layout stretched wide and shrunk to a quarter. There
 * the canvas is only a little wider than its box instead.
 */
export function ScaledCanvas({
  width = 1120,
  children,
  className,
}: {
  width?: number;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{
    width: number;
    scale: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      if (!w) return;
      const design =
        window.innerWidth < 768
          ? Math.min(width, Math.max(Math.round(w * 1.3), 440))
          : width;
      const scale = w / design;
      // The canvas is as wide as `design` and as tall as the box allows at
      // that scale, so a page fills the frame edge to edge.
      setBox({ width: design, scale, height: Math.round(h / scale) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={className ?? "absolute inset-0 overflow-hidden"}>
      <div
        inert
        aria-hidden="true"
        className="showcase-canvas absolute left-0 top-0 origin-top-left bg-background text-foreground"
        style={
          box
            ? {
                width: box.width,
                height: box.height,
                transform: `scale(${box.scale})`,
              }
            : { width, visibility: "hidden" }
        }
      >
        {children}
      </div>
    </div>
  );
}
