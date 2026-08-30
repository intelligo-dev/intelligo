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

const files = import.meta.glob("./app/messages/en/*.json", { eager: true, import: "default" }) as Record<string, Record<string, unknown>>;

export const MESSAGES: Record<string, unknown> = Object.fromEntries(
  Object.entries(files).map(([path, json]) => [path.split("/").pop()!.replace(/\.json$/, ""), json])
);

export function ShowcaseProvider({ pathname, children }: { pathname: string; children: ReactNode }) {
  const [path, setPath] = useState(pathname);
  useEffect(() => setPath(pathname), [pathname]);
  return (
    <IntlProvider locale="en" timeZone="UTC" now={new Date("2026-08-29T09:00:00Z")} messages={MESSAGES} onError={() => {}} getMessageFallback={({ key }) => key.split(".").pop() ?? key}>
      <ShowcaseNavigation pathname={path} onNavigate={(href) => setPath(href.split("?")[0]!)}>
        {children}
        <Toaster position="bottom-right" richColors closeButton />
      </ShowcaseNavigation>
    </IntlProvider>
  );
}

/**
 * A fixed-size canvas scaled to fit its container, so a full-width page
 * reads at frame size without touching the components' own layout.
 */
export function ScaledCanvas({ width = 1120, children, className }: { width?: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ scale: 0.5, height: 660 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      const scale = w / width || 0.5;
      // The canvas is as wide as `width` and as tall as the box allows at
      // that scale, so a page fills the frame edge to edge.
      setBox({ scale, height: Math.round(h / scale) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} className={className ?? "absolute inset-0 overflow-hidden"}>
      <div className="showcase-canvas absolute left-0 top-0 origin-top-left bg-background text-foreground" style={{ width, height: box.height, transform: `scale(${box.scale})` }}>
        {children}
      </div>
    </div>
  );
}
