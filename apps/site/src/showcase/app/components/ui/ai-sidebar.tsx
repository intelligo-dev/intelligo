"use client";

/*
 * The AI product's sidebar: a shell that morphs between a full panel and
 * an icon rail on desktop and slides in as a sheet on mobile; navigation
 * menus with a shared hover pill, an active-item glide and staggered
 * submenus; and a resource tree — folders, projects, conversations, files,
 * bookmarks — with roving focus, drag-and-drop and keyboard moves, inline
 * rename and a row menu. In the rail every item explains itself with a
 * tooltip.
 */

import * as React from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
  type Variants,
} from "motion/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookmarkIcon,
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  FolderInputIcon,
  FolderOpenIcon,
  MessageSquareIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PencilIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react";

import {
  EASE_DRAWER,
  EASE_OUT,
  SPRING_LAYOUT,
  SPRING_PRESS,
} from "@showcase/components/ui/ai-motion";
import { Button } from "@showcase/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@showcase/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@showcase/components/ui/tooltip";
import { cn } from "@showcase/lib/utils";

/* ----------------------------------------------------------------------------
 * Motion
 * ------------------------------------------------------------------------- */

const PANEL_TRANSITION = { duration: 0.36, ease: EASE_DRAWER } as const;

// The desktop rail settles at a hard zero-width boundary. Keep the spring
// critically damped so it cannot overshoot, pause against that boundary, and
// then snap back during the final frame.
const SIDEBAR_MORPH_TRANSITION = {
  type: "spring",
  stiffness: 380,
  damping: 35,
  mass: 0.75,
} as const;

const LABEL_ENTER_TRANSITION = {
  duration: 0.2,
  delay: 0.08,
  ease: EASE_OUT,
} as const;
const LABEL_EXIT_TRANSITION = { duration: 0.12, ease: EASE_OUT } as const;
const REDUCED_TRANSITION = { duration: 0.16, ease: EASE_OUT } as const;
const ROW_REVEAL = { duration: 0.16, ease: EASE_OUT } as const;

const SUBMENU_VARIANTS: Variants = {
  closed: {
    opacity: 0,
    clipPath: "inset(0 0 100% 0 round 8px)",
    transition: {
      duration: 0.14,
      ease: EASE_OUT,
      staggerChildren: 0.025,
      staggerDirection: -1,
    },
  },
  open: {
    opacity: 1,
    clipPath: "inset(0 0 0% 0 round 8px)",
    transition: {
      duration: 0.2,
      delayChildren: 0.035,
      ease: EASE_OUT,
      staggerChildren: 0.045,
    },
  },
};

const SUBMENU_ITEM_VARIANTS: Variants = {
  closed: { opacity: 0, y: -6, filter: "blur(3px)" },
  open: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.18, ease: EASE_OUT },
  },
};

const HOVER_PILL_VARIANTS: Variants = {
  initial: { opacity: 0, filter: "blur(6px)" },
  animate: { opacity: 1, filter: "blur(0px)" },
  exit: { opacity: 0, filter: "blur(6px)" },
};

const HOVER_PILL_REDUCED_VARIANTS: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

/* ----------------------------------------------------------------------------
 * Environment: viewport and input, read as external stores so the server
 * render and the first client render agree.
 * ------------------------------------------------------------------------- */

const MOBILE_QUERY = "(max-width: 767px)";
const TOUCH_QUERY = "(any-pointer: coarse)";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function subscribeToQuery(query: string) {
  return (callback: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", callback);
    return () => list.removeEventListener("change", callback);
  };
}

const subscribeToMobile = subscribeToQuery(MOBILE_QUERY);
const subscribeToTouch = subscribeToQuery(TOUCH_QUERY);
const getMobileSnapshot = () => window.matchMedia(MOBILE_QUERY).matches;
// iPadOS disguises its pointer media queries; maxTouchPoints it reports
// honestly, which is what makes it the standard iPad tell.
const getTouchSnapshot = () =>
  window.matchMedia(TOUCH_QUERY).matches || navigator.maxTouchPoints > 0;
const getServerSnapshot = () => false;

function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToMobile,
    getMobileSnapshot,
    getServerSnapshot
  );
}

/**
 * True on devices that can be touched, whatever else they claim. Not the
 * inverse of hover-capable: an iPad browses desktop-class and answers
 * `(hover: hover)` with true while a finger is the only input there is.
 */
function useTouchCapable() {
  return React.useSyncExternalStore(
    subscribeToTouch,
    getTouchSnapshot,
    getServerSnapshot
  );
}

function assignRef<T>(ref: React.Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as React.RefObject<T | null>).current = node;
}

/* ----------------------------------------------------------------------------
 * Provider: one open state for the desktop panel, one for the mobile sheet,
 * the keyboard shortcut, and the layout id the active pill glides on.
 * ------------------------------------------------------------------------- */

export type AISidebarState = "expanded" | "collapsed";
export type AISidebarSide = "left" | "right";
export type AISidebarVariant = "sidebar" | "floating" | "inset";
export type AISidebarCollapsible = "offcanvas" | "icon" | "none";

export interface AISidebarContextValue {
  isMobile: boolean;
  layoutId: string;
  open: boolean;
  openMobile: boolean;
  reduce: boolean;
  setOpen: (open: boolean) => void;
  setOpenMobile: (open: boolean) => void;
  state: AISidebarState;
  toggleSidebar: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

const SidebarContext = React.createContext<AISidebarContextValue | null>(null);

interface PanelContextValue {
  collapsed: boolean;
  collapsible: AISidebarCollapsible;
  side: AISidebarSide;
}

const PanelContext = React.createContext<PanelContextValue | null>(null);

function useAISidebar() {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useAISidebar must be used inside <AISidebarProvider>.");
  }
  return context;
}

/** The nearest sidebar panel: whether it is collapsed to the rail, and its side. */
function useSidebarPanel() {
  const context = React.useContext(PanelContext);
  if (!context) {
    throw new Error("AISidebar parts must be used inside <AISidebar>.");
  }
  return context;
}

export type AISidebarStyle = React.CSSProperties & {
  "--sidebar-width"?: string;
  "--sidebar-width-icon"?: string;
  "--sidebar-width-mobile"?: string;
};

export interface AISidebarProviderProps
  extends Omit<React.ComponentProps<"div">, "style"> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  openMobile?: boolean;
  defaultOpenMobile?: boolean;
  onOpenMobileChange?: (open: boolean) => void;
  /** The key that toggles the sidebar with ⌘ / Ctrl; `null` turns it off. */
  shortcut?: string | null;
  /** Widths come in as `--sidebar-width`, `--sidebar-width-icon`, `--sidebar-width-mobile`. */
  style?: AISidebarStyle;
}

function AISidebarProvider({
  children,
  open,
  defaultOpen = true,
  onOpenChange,
  openMobile,
  defaultOpenMobile = false,
  onOpenMobileChange,
  shortcut = "b",
  className,
  style,
  ...props
}: AISidebarProviderProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  const [internalOpenMobile, setInternalOpenMobile] =
    React.useState(defaultOpenMobile);
  const isMobile = useIsMobile();
  const reduce = useReducedMotion() ?? false;
  const generatedId = React.useId();
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const desktopOpen = open ?? internalOpen;
  const mobileOpen = openMobile ?? internalOpenMobile;

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setInternalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [onOpenChange, open]
  );

  const setOpenMobile = React.useCallback(
    (nextOpen: boolean) => {
      if (openMobile === undefined) setInternalOpenMobile(nextOpen);
      onOpenMobileChange?.(nextOpen);
    },
    [onOpenMobileChange, openMobile]
  );

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile(!mobileOpen);
    else setOpen(!desktopOpen);
  }, [desktopOpen, isMobile, mobileOpen, setOpen, setOpenMobile]);

  React.useEffect(() => {
    if (!shortcut) return;
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() === shortcut.toLowerCase() &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [shortcut, toggleSidebar]);

  const value = React.useMemo<AISidebarContextValue>(
    () => ({
      isMobile,
      layoutId: `${generatedId}-active`,
      open: desktopOpen,
      openMobile: mobileOpen,
      reduce,
      setOpen,
      setOpenMobile,
      state: desktopOpen ? "expanded" : "collapsed",
      toggleSidebar,
      triggerRef,
    }),
    [
      desktopOpen,
      generatedId,
      isMobile,
      mobileOpen,
      reduce,
      setOpen,
      setOpenMobile,
      toggleSidebar,
    ]
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider>
        <div
          {...props}
          data-slot="sidebar-wrapper"
          data-state={desktopOpen ? "expanded" : "collapsed"}
          style={{
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "4.25rem",
            "--sidebar-width-mobile": "18rem",
            ...style,
          }}
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full min-w-0",
            className
          )}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

/* ----------------------------------------------------------------------------
 * The mobile sheet: a scrim and a panel that slides in from its side, with
 * a focus trap, Escape, a body scroll lock and focus handed back to the
 * trigger on close.
 * ------------------------------------------------------------------------- */

function MobileSidebar({
  label,
  closeLabel,
  children,
  className,
  side,
}: {
  label: string;
  closeLabel: string;
  children: React.ReactNode;
  className?: string;
  side: AISidebarSide;
}) {
  const context = useAISidebar();
  const panelRef = React.useRef<HTMLDivElement>(null);
  // The sheet is mounted for as long as the viewport is mobile, so it hides
  // itself while closed rather than sitting there transparent and interactive.
  // Opening shows it in the same commit that starts the slide — a delayed show
  // would run the focus effect below against a still-hidden panel, and focus()
  // on a hidden element is ignored. Closing waits for the slide to finish, and
  // the panel's own exit tells us when that is: no duration to keep in sync.
  const [hidden, setHidden] = React.useState(!context.openMobile);
  const [wasOpen, setWasOpen] = React.useState(context.openMobile);
  if (context.openMobile !== wasOpen) {
    setWasOpen(context.openMobile);
    if (context.openMobile) setHidden(false);
  }
  // The completion callback fires for the open slide too, and it reads state
  // from whenever motion settles: a ref keeps it on the current one.
  const openMobileRef = React.useRef(context.openMobile);
  React.useEffect(() => {
    openMobileRef.current = context.openMobile;
  }, [context.openMobile]);

  React.useEffect(() => {
    if (!context.openMobile) return;

    const body = document.body;
    const scrollY = window.scrollY;
    const previous = {
      left: body.style.left,
      overflow: body.style.overflow,
      position: body.style.position,
      right: body.style.right,
      top: body.style.top,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.overflow = "hidden";

    const focusFrame = requestAnimationFrame(() => {
      const first =
        panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panelRef.current)?.focus({ preventScroll: true });
    });

    return () => {
      cancelAnimationFrame(focusFrame);
      body.style.position = previous.position;
      body.style.top = previous.top;
      body.style.left = previous.left;
      body.style.right = previous.right;
      body.style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
      context.triggerRef.current?.focus({ preventScroll: true });
    };
  }, [context.openMobile, context.triggerRef]);

  // This container groups the sheet for hiding and the z-index and carries no
  // box: both children are `fixed` and resolve against the viewport themselves.
  return (
    <div
      data-slot="sidebar-mobile"
      className={cn(
        "pointer-events-none fixed top-0 left-0 z-50 size-0 md:hidden",
        hidden && !context.openMobile ? "invisible" : "visible"
      )}
    >
      <motion.button
        type="button"
        aria-label={closeLabel}
        tabIndex={context.openMobile ? 0 : -1}
        initial={false}
        animate={{ opacity: context.openMobile ? 1 : 0 }}
        transition={context.reduce ? REDUCED_TRANSITION : PANEL_TRANSITION}
        onClick={() => context.setOpenMobile(false)}
        data-slot="sidebar-scrim"
        className={cn(
          "fixed inset-0 bg-background/60 backdrop-blur-xs",
          context.openMobile ? "pointer-events-auto" : "pointer-events-none"
        )}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-hidden={!context.openMobile}
        inert={!context.openMobile}
        tabIndex={-1}
        data-slot="sidebar"
        data-mobile="true"
        data-state={context.openMobile ? "expanded" : "collapsed"}
        data-side={side}
        initial={false}
        animate={{
          opacity: context.reduce ? (context.openMobile ? 1 : 0) : 1,
          x: context.reduce
            ? 0
            : context.openMobile
              ? "0%"
              : side === "left"
                ? "-100%"
                : "100%",
        }}
        transition={context.reduce ? REDUCED_TRANSITION : PANEL_TRANSITION}
        onAnimationComplete={() => {
          if (!openMobileRef.current) setHidden(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            context.setOpenMobile(false);
            return;
          }

          if (event.key !== "Tab") return;
          const focusable = panelRef.current
            ? Array.from(
                panelRef.current.querySelectorAll<HTMLElement>(
                  FOCUSABLE_SELECTOR
                )
              )
            : [];

          if (focusable.length === 0) {
            event.preventDefault();
            panelRef.current?.focus();
            return;
          }

          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        style={{ maxWidth: "88vw" }}
        className={cn(
          "pointer-events-auto fixed inset-y-0 flex h-dvh w-(--sidebar-width-mobile) flex-col overflow-hidden",
          "border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl will-change-transform",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          !context.openMobile && "pointer-events-none",
          className
        )}
      >
        <PanelContext.Provider
          value={{ collapsed: false, collapsible: "none", side }}
        >
          {children}
        </PanelContext.Provider>
      </motion.div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * The sidebar itself: an aside whose width morphs between the panel and
 * the icon rail (or off the canvas), and the sheet on mobile.
 * ------------------------------------------------------------------------- */

export interface AISidebarProps
  extends Omit<HTMLMotionProps<"aside">, "children"> {
  children?: React.ReactNode;
  side?: AISidebarSide;
  variant?: AISidebarVariant;
  collapsible?: AISidebarCollapsible;
  /** Accessible name of the sidebar. */
  label?: string;
  /** Accessible name of the scrim that closes the mobile sheet. */
  closeLabel?: string;
  panelClassName?: string;
}

function AISidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "icon",
  label = "Sidebar",
  closeLabel = "Close sidebar",
  children,
  className,
  panelClassName,
  ...props
}: AISidebarProps) {
  const context = useAISidebar();
  const collapsed = collapsible !== "none" && !context.open;
  const offcanvas = collapsed && collapsible === "offcanvas";
  const width = offcanvas
    ? "0px"
    : collapsed
      ? "var(--sidebar-width-icon)"
      : "var(--sidebar-width)";

  if (context.isMobile) {
    return (
      <MobileSidebar
        label={label}
        closeLabel={closeLabel}
        className={className}
        side={side}
      >
        {children}
      </MobileSidebar>
    );
  }

  const framed = variant === "floating" || variant === "inset";

  return (
    <motion.aside
      {...props}
      initial={false}
      aria-label={label}
      data-slot="sidebar"
      data-state={collapsed ? "collapsed" : "expanded"}
      data-collapsible={collapsible}
      data-variant={variant}
      data-side={side}
      animate={{ width }}
      transition={context.reduce ? { duration: 0 } : SIDEBAR_MORPH_TRANSITION}
      className={cn(
        "group/sidebar peer relative hidden h-auto shrink-0 will-change-[width] md:block",
        side === "right" && "order-last",
        className
      )}
    >
      <motion.div
        initial={false}
        animate={{
          opacity: offcanvas ? 0 : 1,
          x: offcanvas ? (side === "left" ? "-100%" : "100%") : "0%",
        }}
        transition={context.reduce ? REDUCED_TRANSITION : PANEL_TRANSITION}
        data-slot="sidebar-panel"
        style={framed ? { height: "calc(100svh - 1rem)" } : undefined}
        className={cn(
          "sticky top-0 flex h-svh w-full flex-col overflow-hidden bg-sidebar text-sidebar-foreground",
          collapsible === "offcanvas" && "w-(--sidebar-width)",
          variant === "sidebar" &&
            (side === "left"
              ? "border-r border-sidebar-border"
              : "border-l border-sidebar-border"),
          variant === "floating" &&
            "m-2 rounded-2xl border border-sidebar-border shadow-sm",
          variant === "inset" && "m-2 rounded-2xl",
          panelClassName
        )}
      >
        <PanelContext.Provider value={{ collapsed, collapsible, side }}>
          {children}
        </PanelContext.Provider>
      </motion.div>
    </motion.aside>
  );
}

/* ----------------------------------------------------------------------------
 * Controls: the trigger (anywhere in the app), a close button, the thin
 * rail on the sidebar's edge, and the main area beside it.
 * ------------------------------------------------------------------------- */

export interface AISidebarTriggerProps
  extends React.ComponentProps<typeof Button> {
  /** Accessible name; the default child is a panel icon. */
  label?: string;
}

function AISidebarTrigger({
  label = "Toggle sidebar",
  className,
  onClick,
  children,
  variant = "ghost",
  size = "icon",
  ...props
}: AISidebarTriggerProps) {
  const context = useAISidebar();
  const expanded = context.isMobile ? context.openMobile : context.open;
  const forwarded = (props as { ref?: React.Ref<HTMLButtonElement> }).ref;

  return (
    <Button
      {...props}
      ref={(node: HTMLButtonElement | null) => {
        context.triggerRef.current = node;
        assignRef(forwarded, node);
      }}
      variant={variant}
      size={size}
      aria-label={label}
      aria-expanded={expanded}
      data-slot="sidebar-trigger"
      data-state={expanded ? "expanded" : "collapsed"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.toggleSidebar();
      }}
      // `aria-expanded` is this toggle's resting state while the panel is
      // open, not a pressed look: keep the ghost button flat until hovered.
      className={cn(
        "shrink-0 aria-expanded:not-hover:bg-transparent aria-expanded:not-hover:text-muted-foreground",
        className
      )}
    >
      {children ?? <PanelLeftIcon />}
    </Button>
  );
}

export interface AISidebarCloseProps
  extends React.ComponentProps<typeof Button> {
  label?: string;
}

function AISidebarClose({
  label = "Close sidebar",
  className,
  onClick,
  variant = "ghost",
  size = "icon",
  ...props
}: AISidebarCloseProps) {
  const context = useAISidebar();

  return (
    <Button
      {...props}
      variant={variant}
      size={size}
      aria-label={label}
      data-slot="sidebar-close"
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (context.isMobile) context.setOpenMobile(false);
        else context.setOpen(false);
      }}
      className={cn("shrink-0", className)}
    />
  );
}

export interface AISidebarRailProps extends React.ComponentProps<"button"> {
  label?: string;
}

/** A thin strip on the sidebar's edge that toggles it — a pointer target, not a tab stop. */
function AISidebarRail({
  label = "Toggle sidebar",
  className,
  onClick,
  type = "button",
  ...props
}: AISidebarRailProps) {
  const context = useAISidebar();
  const panel = useSidebarPanel();

  return (
    <button
      {...props}
      type={type}
      data-slot="sidebar-rail"
      data-side={panel.side}
      aria-label={label}
      title={label}
      tabIndex={-1}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) context.toggleSidebar();
      }}
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 outline-none md:block",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-transparent after:transition-colors hover:after:bg-sidebar-border",
        "data-[side=left]:left-full data-[side=right]:right-0 data-[side=right]:translate-x-1/2",
        className
      )}
    />
  );
}

function AISidebarInset({ className, ...props }: React.ComponentProps<"main">) {
  return (
    <main
      {...props}
      data-slot="sidebar-inset"
      className={cn(
        "relative flex min-h-svh min-w-0 flex-1 flex-col bg-background",
        "md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-2xl md:peer-data-[variant=inset]:shadow-sm",
        className
      )}
    />
  );
}

/* ----------------------------------------------------------------------------
 * Regions
 * ------------------------------------------------------------------------- */

function AISidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="sidebar-header"
      className={cn("flex shrink-0 flex-col gap-2 p-3", className)}
    />
  );
}

function AISidebarContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="sidebar-content"
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto overscroll-contain px-2 py-2",
        className
      )}
    />
  );
}

function AISidebarFooter({
  className,
  style,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      {...props}
      data-slot="sidebar-footer"
      style={{
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        ...style,
      }}
      className={cn(
        "flex shrink-0 flex-col gap-2 border-t border-sidebar-border p-3",
        className
      )}
    />
  );
}

export interface AISidebarSectionProps extends React.ComponentProps<"div"> {
  /** A small caps heading; it fades out in the rail. */
  label?: React.ReactNode;
  /** A control at the end of the heading — "new", "add" — hidden in the rail. */
  action?: React.ReactNode;
}

function AISidebarSection({
  label,
  action,
  children,
  className,
  ...props
}: AISidebarSectionProps) {
  const { collapsed } = useSidebarPanel();

  return (
    <div
      {...props}
      data-slot="sidebar-section"
      className={cn("flex w-full min-w-0 flex-col px-1 py-1.5", className)}
    >
      {label !== undefined && label !== null ? (
        <div
          aria-hidden={collapsed}
          data-slot="sidebar-section-label"
          className={cn(
            "mb-1 flex h-7 items-center justify-between gap-2 overflow-hidden px-2 text-xs font-medium tracking-widest text-muted-foreground uppercase transition-opacity",
            collapsed ? "opacity-0" : "opacity-100"
          )}
        >
          <span className="min-w-0 truncate">{label}</span>
          {action && !collapsed ? (
            <span
              data-slot="sidebar-section-action"
              className="flex shrink-0 items-center normal-case tracking-normal"
            >
              {action}
            </span>
          ) : null}
        </div>
      ) : null}
      <div data-slot="sidebar-section-content" className="w-full min-w-0">
        {children}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Menus: a list whose hover pill glides between rows, items with an
 * active pill that glides too, and submenus that unfold with a stagger.
 * ------------------------------------------------------------------------- */

interface MenuContextValue {
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  pillId: string;
}

const MenuContext = React.createContext<MenuContextValue | null>(null);

export interface AISidebarMenuProps
  extends Omit<HTMLMotionProps<"ul">, "children"> {
  children?: React.ReactNode;
}

function AISidebarMenu({
  children,
  className,
  onMouseLeave,
  ...props
}: AISidebarMenuProps) {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const pillId = React.useId();
  const value = React.useMemo<MenuContextValue>(
    () => ({ hoveredId, setHoveredId, pillId }),
    [hoveredId, pillId]
  );

  // layoutRoot scopes the pill's layout projection to this list, so fixed or
  // scrolled ancestors can't smear scroll offsets into its movement.
  return (
    <MenuContext.Provider value={value}>
      <motion.ul
        {...props}
        layoutRoot
        data-slot="sidebar-menu"
        onMouseLeave={(event) => {
          setHoveredId(null);
          onMouseLeave?.(event);
        }}
        className={cn(
          "flex w-full min-w-0 list-none flex-col gap-0.5",
          className
        )}
      >
        {children}
      </motion.ul>
    </MenuContext.Provider>
  );
}

export interface AISidebarMenuItemProps
  extends Omit<HTMLMotionProps<"li">, "children"> {
  children?: React.ReactNode;
}

function AISidebarMenuItem({
  children,
  className,
  onMouseEnter,
  ...props
}: AISidebarMenuItemProps) {
  const menu = React.useContext(MenuContext);
  const reduce = useReducedMotion() ?? false;
  const id = React.useId();
  const hovered = menu?.hoveredId === id;

  return (
    <motion.li
      {...props}
      layout="position"
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      data-slot="sidebar-menu-item"
      onMouseEnter={(event) => {
        menu?.setHoveredId(id);
        onMouseEnter?.(event);
      }}
      className={cn("group/sidebar-menu-item relative", className)}
    >
      {menu ? (
        <AnimatePresence>
          {menu.hoveredId !== null ? (
            <motion.div
              key="hover-pill"
              aria-hidden
              variants={reduce ? HOVER_PILL_REDUCED_VARIANTS : HOVER_PILL_VARIANTS}
              initial="initial"
              animate="animate"
              exit="exit"
              className="pointer-events-none absolute inset-x-0 top-0 h-9"
            >
              {hovered ? (
                <motion.div
                  layoutId={menu.pillId}
                  transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                  className="size-full rounded-xl bg-sidebar-accent/70"
                />
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      ) : null}
      <div className="relative z-10">{children}</div>
    </motion.li>
  );
}

export interface AISidebarItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  href?: string;
  isActive?: boolean;
  /** Set when the item opens a submenu: renders the chevron and `aria-expanded`. */
  expanded?: boolean;
  disabled?: boolean;
  /** Close the mobile sheet on select; defaults to true unless the item opens a submenu. */
  closeOnSelect?: boolean;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
  onSelect?: () => void;
  /** What the rail tooltip says; defaults to the label when it is a string. */
  tooltip?: string;
  /**
   * The element to render instead of the default `a`/`button` — a router
   * link, say `<Link href="/chat" />`. Its own props and handlers are
   * merged with the item's.
   */
  render?: React.ReactElement;
  /** A control at the row's end — a menu trigger — shown on hover and focus. */
  action?: React.ReactNode;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  title?: string;
  className?: string;
}

function AISidebarItem({
  children,
  icon,
  badge,
  href,
  isActive = false,
  expanded,
  disabled = false,
  closeOnSelect,
  target,
  rel,
  onSelect,
  tooltip,
  render,
  action,
  onKeyDown,
  title,
  className,
}: AISidebarItemProps) {
  const context = useAISidebar();
  const panel = useSidebarPanel();
  const showAction = Boolean(action) && !panel.collapsed;
  const textLabel = typeof children === "string" ? children : undefined;
  const tip = tooltip ?? textLabel;

  const select = (
    event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>
  ) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onSelect?.();
    const shouldCloseOnSelect = closeOnSelect ?? expanded === undefined;
    if (context.isMobile && shouldCloseOnSelect) context.setOpenMobile(false);
    // A submenu cannot render in the icon rail, so opening one from there
    // leaves its children unreachable — a pointer can still fall back to the
    // rail or the shortcut, a finger has nothing. Selecting a group unfolds
    // the panel that is about to hold it.
    if (expanded !== undefined && panel.collapsed && !context.isMobile) {
      context.setOpen(true);
    }
  };

  const content = (
    <>
      {isActive ? (
        <motion.span
          layoutId={context.layoutId}
          transition={context.reduce ? { duration: 0 } : SPRING_LAYOUT}
          data-slot="sidebar-item-active"
          className="absolute inset-0 rounded-xl bg-sidebar-accent"
        />
      ) : null}
      {icon ? (
        <span
          aria-hidden="true"
          data-slot="sidebar-item-icon"
          className="relative z-10 grid size-5 shrink-0 place-items-center [&_svg:not([class*='size-'])]:size-4"
        >
          {icon}
        </span>
      ) : null}
      <motion.span
        initial={false}
        animate={{
          opacity: panel.collapsed ? 0 : 1,
          x: context.reduce ? 0 : panel.collapsed ? -4 : 0,
        }}
        transition={
          context.reduce
            ? REDUCED_TRANSITION
            : panel.collapsed
              ? LABEL_EXIT_TRANSITION
              : LABEL_ENTER_TRANSITION
        }
        aria-hidden={panel.collapsed}
        data-slot="sidebar-item-label"
        className={cn(
          "relative z-10 min-w-0 flex-1 truncate",
          panel.collapsed && "pointer-events-none"
        )}
      >
        {children}
      </motion.span>
      {badge && !panel.collapsed ? (
        <span
          data-slot="sidebar-item-badge"
          className="relative z-10 shrink-0 text-xs text-muted-foreground"
        >
          {badge}
        </span>
      ) : null}
      {expanded !== undefined ? (
        <motion.span
          aria-hidden="true"
          initial={false}
          animate={{
            opacity: panel.collapsed ? 0 : 1,
            rotate: expanded ? 90 : 0,
            x: context.reduce ? 0 : panel.collapsed ? 4 : 0,
          }}
          transition={context.reduce ? { duration: 0 } : SPRING_LAYOUT}
          className="relative z-10 grid size-4 shrink-0 place-items-center text-muted-foreground"
        >
          <ChevronRightIcon className="size-3.5" />
        </motion.span>
      ) : null}
    </>
  );

  const interactiveClassName = cn(
    "relative flex min-h-9 w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-xl px-3 text-left text-sm font-medium outline-none",
    "text-muted-foreground transition-colors hover:text-sidebar-foreground",
    "focus-visible:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    isActive && "text-sidebar-accent-foreground",
    disabled && "cursor-not-allowed opacity-40",
    showAction && "pr-9",
    className
  );

  const element = render ? (
    render
  ) : href ? (
    <motion.a
      href={href}
      target={target}
      rel={rel ?? (target === "_blank" ? "noreferrer noopener" : undefined)}
      aria-current={isActive ? "page" : undefined}
      aria-expanded={expanded}
      aria-disabled={disabled || undefined}
      aria-label={panel.collapsed ? tip : undefined}
      tabIndex={disabled ? -1 : undefined}
      data-slot="sidebar-item"
      data-active={isActive || undefined}
      onClick={select}
      whileTap={context.reduce || disabled ? undefined : { scale: 0.98 }}
      transition={SPRING_PRESS}
      className={interactiveClassName}
    />
  ) : (
    <motion.button
      type="button"
      disabled={disabled}
      aria-current={isActive ? "page" : undefined}
      aria-expanded={expanded}
      aria-label={panel.collapsed ? tip : undefined}
      data-slot="sidebar-item"
      data-active={isActive || undefined}
      onClick={select}
      whileTap={context.reduce || disabled ? undefined : { scale: 0.98 }}
      transition={SPRING_PRESS}
      className={interactiveClassName}
    />
  );

  // A custom element gets the item's props through Base UI's merge; the
  // default ones carry them already.
  const merged = render
    ? {
        "aria-current": isActive ? ("page" as const) : undefined,
        "aria-expanded": expanded,
        "aria-disabled": disabled || undefined,
        "aria-label": panel.collapsed ? tip : undefined,
        "data-slot": "sidebar-item",
        "data-active": isActive || undefined,
        onClick: select,
        className: interactiveClassName,
      }
    : {};

  // The rail shows only the icon; the tooltip carries the label there.
  return (
    <>
      <Tooltip disabled={!panel.collapsed || !tip}>
        <TooltipTrigger
          render={element}
          onKeyDown={onKeyDown}
          title={title}
          {...merged}
        >
          {content}
        </TooltipTrigger>
        <TooltipContent
          side={panel.side === "right" ? "left" : "right"}
          sideOffset={8}
        >
          {tip}
        </TooltipContent>
      </Tooltip>
      {showAction ? (
        <span
          data-slot="sidebar-item-action"
          className="absolute top-1/2 right-1 z-20 flex -translate-y-1/2 items-center opacity-0 transition-opacity group-focus-within/sidebar-menu-item:opacity-100 group-hover/sidebar-menu-item:opacity-100 has-data-popup-open:opacity-100 pointer-coarse:opacity-100"
        >
          {action}
        </span>
      ) : null}
    </>
  );
}

export interface AISidebarSubmenuProps
  extends Omit<HTMLMotionProps<"ul">, "children"> {
  open: boolean;
  children?: React.ReactNode;
}

function AISidebarSubmenu({
  open,
  children,
  className,
  ...props
}: AISidebarSubmenuProps) {
  const context = useAISidebar();
  const panel = useSidebarPanel();

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {open && !panel.collapsed ? (
        <motion.ul
          {...props}
          key="sidebar-submenu"
          variants={context.reduce ? undefined : SUBMENU_VARIANTS}
          initial={context.reduce ? false : "closed"}
          animate={context.reduce ? { opacity: 1 } : "open"}
          exit={context.reduce ? { opacity: 0 } : "closed"}
          transition={context.reduce ? { duration: 0.12 } : undefined}
          data-slot="sidebar-submenu"
          className={cn(
            "relative mt-1 ml-5 flex min-w-0 list-none flex-col gap-0.5 border-l border-sidebar-border pl-3",
            className
          )}
        >
          {children}
        </motion.ul>
      ) : null}
    </AnimatePresence>
  );
}

export interface AISidebarSubItemProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  href?: string;
  isActive?: boolean;
  disabled?: boolean;
  closeOnSelect?: boolean;
  target?: "_blank" | "_self" | "_parent" | "_top";
  rel?: string;
  onSelect?: () => void;
  /** The element to render instead of the default `a`/`button`, e.g. a router link. */
  render?: React.ReactElement;
  className?: string;
}

function AISidebarSubItem({
  children,
  icon,
  href,
  isActive = false,
  disabled = false,
  closeOnSelect = true,
  target,
  rel,
  onSelect,
  render,
  className,
}: AISidebarSubItemProps) {
  const context = useAISidebar();

  const select = (
    event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>
  ) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onSelect?.();
    if (context.isMobile && closeOnSelect) context.setOpenMobile(false);
  };

  const content = (
    <>
      <span
        aria-hidden="true"
        className="grid size-4 shrink-0 place-items-center [&_svg:not([class*='size-'])]:size-3.5"
      >
        {icon ?? <span className="size-1 rounded-full bg-current" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </>
  );

  const interactiveClassName = cn(
    "flex min-h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-left text-xs outline-none",
    "text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
    "focus-visible:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    isActive && "bg-sidebar-accent/70 text-sidebar-accent-foreground",
    disabled && "cursor-not-allowed opacity-40",
    className
  );

  return (
    <motion.li
      variants={SUBMENU_ITEM_VARIANTS}
      data-slot="sidebar-sub-item"
      className="relative min-w-0"
    >
      {render ? (
        React.cloneElement(
          render as React.ReactElement<Record<string, unknown>>,
          {
            "aria-current": isActive ? "page" : undefined,
            "aria-disabled": disabled || undefined,
            "data-active": isActive || undefined,
            onClick: (
              event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>
            ) => {
              (
                render.props as {
                  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
                }
              ).onClick?.(event);
              select(event);
            },
            className: cn(
              interactiveClassName,
              (render.props as { className?: string }).className
            ),
          },
          content
        )
      ) : href ? (
        <motion.a
          href={href}
          target={target}
          rel={rel ?? (target === "_blank" ? "noreferrer noopener" : undefined)}
          aria-current={isActive ? "page" : undefined}
          aria-disabled={disabled || undefined}
          tabIndex={disabled ? -1 : undefined}
          data-active={isActive || undefined}
          onClick={select}
          whileTap={context.reduce || disabled ? undefined : { scale: 0.98 }}
          transition={SPRING_PRESS}
          className={interactiveClassName}
        >
          {content}
        </motion.a>
      ) : (
        <motion.button
          type="button"
          disabled={disabled}
          aria-current={isActive ? "page" : undefined}
          data-active={isActive || undefined}
          onClick={select}
          whileTap={context.reduce || disabled ? undefined : { scale: 0.98 }}
          transition={SPRING_PRESS}
          className={interactiveClassName}
        >
          {content}
        </motion.button>
      )}
    </motion.li>
  );
}

/* ----------------------------------------------------------------------------
 * The resource tree: folders and projects that hold conversations, files
 * and bookmarks. Roving focus, `Alt+Shift+Arrow` moves, pointer drag, F2
 * rename, and a row menu that carries the same moves for a finger.
 * ------------------------------------------------------------------------- */

export type AISidebarResourceKind =
  | "folder"
  | "project"
  | "conversation"
  | "file"
  | "bookmark";

export interface AISidebarResource {
  id: string;
  label: string;
  kind: AISidebarResourceKind;
  children?: AISidebarResource[];
  disabled?: boolean;
}

export type AISidebarDropPosition = "before" | "inside" | "after";

export interface AISidebarResourceMove {
  itemId: string;
  targetId: string | null;
  position: AISidebarDropPosition;
}

/**
 * The moves this row can make right now, the same four the keyboard offers on
 * `Alt+Shift+Arrow`. A pointer drag is the fast path for them; a finger has no
 * drag to give, so the row menu carries them too. Absent keys are moves this
 * row cannot make from where it sits.
 */
export interface AISidebarMoveCommands {
  up?: () => void;
  down?: () => void;
  into?: { label: string; run: () => void };
  out?: () => void;
}

export interface AISidebarResourceMenuControls {
  close: () => void;
  rename: () => void;
  moves: AISidebarMoveCommands;
}

/** Every string the tree shows or announces, so a product can translate it. */
export interface AISidebarTreeLabels {
  /** Accessible name of the tree. */
  tree: string;
  rename: string;
  moveUp: string;
  moveDown: string;
  moveInto: (target: string) => string;
  moveOut: string;
  moveToTopLevel: string;
  actionsFor: (item: string) => string;
  renameField: (item: string) => string;
  movePending: string;
  moved: (item: string, position: AISidebarDropPosition, target: string) => string;
  movedToTopLevel: (item: string) => string;
  moveFailed: (item: string) => string;
  renameFailed: (item: string) => string;
  /** The name used for an item the tree can no longer find. */
  item: string;
}

const DEFAULT_TREE_LABELS: AISidebarTreeLabels = {
  tree: "Resources",
  rename: "Rename",
  moveUp: "Move up",
  moveDown: "Move down",
  moveInto: (target) => `Move into ${target}`,
  moveOut: "Move out",
  moveToTopLevel: "Move to top level",
  actionsFor: (item) => `Actions for ${item}`,
  renameField: (item) => `Rename ${item}`,
  movePending: "Wait for the current move to finish.",
  moved: (item, position, target) => `Moved ${item} ${position} ${target}.`,
  movedToTopLevel: (item) => `Moved ${item} to the top level.`,
  moveFailed: (item) => `Move failed. ${item} was restored.`,
  renameFailed: (item) => `Rename failed. ${item} was restored.`,
  item: "item",
};

export interface AISidebarTreeProps {
  items?: AISidebarResource[];
  defaultItems?: AISidebarResource[];
  onItemsChange?: (items: AISidebarResource[]) => void;
  /** Reject the promise to roll the optimistic move back. */
  onMove?: (move: AISidebarResourceMove) => void | Promise<void>;
  onMoveError?: (error: unknown, move: AISidebarResourceMove) => void;
  onRename?: (item: AISidebarResource, label: string) => void | Promise<void>;
  activeId?: string | null;
  defaultActiveId?: string | null;
  onActiveChange?: (id: string) => void;
  defaultExpandedIds?: string[];
  renderIcon?: (item: AISidebarResource) => React.ReactNode;
  renderMenu?: (
    item: AISidebarResource,
    controls: AISidebarResourceMenuControls
  ) => React.ReactNode;
  labels?: Partial<AISidebarTreeLabels>;
  className?: string;
}

interface FlatResource {
  item: AISidebarResource;
  depth: number;
  parentId: string | null;
}

interface DropTarget {
  id: string | null;
  position: AISidebarDropPosition;
}

function canContain(item: AISidebarResource) {
  return item.kind === "folder" || item.kind === "project";
}

function flattenResources(
  items: AISidebarResource[],
  expanded: Set<string>,
  depth = 0,
  parentId: string | null = null
): FlatResource[] {
  return items.flatMap((item) => {
    const row = { item, depth, parentId };
    if (!item.children?.length || !expanded.has(item.id)) return [row];
    return [
      row,
      ...flattenResources(item.children, expanded, depth + 1, item.id),
    ];
  });
}

function findResource(
  items: AISidebarResource[],
  id: string
): AISidebarResource | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    const child = item.children ? findResource(item.children, id) : undefined;
    if (child) return child;
  }
  return undefined;
}

function containsResource(item: AISidebarResource, id: string): boolean {
  return (
    item.id === id ||
    item.children?.some((child) => containsResource(child, id)) === true
  );
}

function removeResource(
  items: AISidebarResource[],
  id: string
): { items: AISidebarResource[]; removed?: AISidebarResource } {
  let removed: AISidebarResource | undefined;
  const next: AISidebarResource[] = [];

  for (const item of items) {
    if (item.id === id) {
      removed = item;
      continue;
    }

    if (item.children?.length) {
      const childResult = removeResource(item.children, id);
      if (childResult.removed) {
        removed = childResult.removed;
        next.push({ ...item, children: childResult.items });
        continue;
      }
    }

    next.push(item);
  }

  return { items: next, removed };
}

function insertResource(
  items: AISidebarResource[],
  resource: AISidebarResource,
  targetId: string | null,
  position: AISidebarDropPosition
): AISidebarResource[] {
  if (targetId === null) return [...items, resource];

  const next: AISidebarResource[] = [];
  for (const item of items) {
    if (item.id === targetId) {
      if (position === "before") next.push(resource, item);
      else if (position === "after") next.push(item, resource);
      else
        next.push({ ...item, children: [...(item.children ?? []), resource] });
      continue;
    }

    if (item.children?.length) {
      next.push({
        ...item,
        children: insertResource(item.children, resource, targetId, position),
      });
    } else {
      next.push(item);
    }
  }
  return next;
}

function moveResource(
  items: AISidebarResource[],
  move: AISidebarResourceMove
): AISidebarResource[] | null {
  const source = findResource(items, move.itemId);
  if (!source || source.disabled) return null;
  if (move.targetId && containsResource(source, move.targetId)) return null;

  const target = move.targetId ? findResource(items, move.targetId) : undefined;
  if (
    move.position === "inside" &&
    (!target || target.disabled || !canContain(target))
  )
    return null;

  const removed = removeResource(items, move.itemId);
  if (!removed.removed) return null;
  return insertResource(
    removed.items,
    removed.removed,
    move.targetId,
    move.position
  );
}

function renameResource(
  items: AISidebarResource[],
  id: string,
  label: string
): AISidebarResource[] {
  return items.map((item) => ({
    ...item,
    label: item.id === id ? label : item.label,
    children: item.children
      ? renameResource(item.children, id, label)
      : undefined,
  }));
}

function defaultIcon(item: AISidebarResource, expanded: boolean) {
  const Icon: LucideIcon =
    item.kind === "folder" || item.kind === "project"
      ? expanded
        ? FolderOpenIcon
        : FolderIcon
      : item.kind === "bookmark"
        ? BookmarkIcon
        : item.kind === "conversation"
          ? MessageSquareIcon
          : FileTextIcon;
  return <Icon className="size-4" />;
}

/** A label too long for its row scrolls past while the row is hovered. */
function MarqueeLabel({
  active,
  children,
}: {
  active: boolean;
  children: string;
}) {
  const reduce = useReducedMotion() ?? false;
  const viewportRef = React.useRef<HTMLSpanElement>(null);
  const labelRef = React.useRef<HTMLSpanElement>(null);
  const [distance, setDistance] = React.useState(0);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    const label = labelRef.current;
    if (!viewport || !label) return;
    // ResizeObserver reports once on observe, so this is the first measure too.
    const observer = new ResizeObserver(() => {
      setDistance(
        label.scrollWidth > viewport.clientWidth ? label.scrollWidth + 24 : 0
      );
    });
    observer.observe(viewport);
    observer.observe(label);
    return () => observer.disconnect();
  }, []);

  const running = active && distance > 0 && !reduce;

  return (
    <span
      ref={viewportRef}
      data-slot="sidebar-tree-label"
      className="block min-w-0 flex-1 overflow-hidden"
    >
      <motion.span
        className="flex w-max items-center gap-6 whitespace-nowrap"
        animate={{ x: running ? [0, -distance] : 0 }}
        transition={
          running
            ? {
                duration: Math.max(2.4, distance / 34),
                ease: "linear",
                repeat: Number.POSITIVE_INFINITY,
                repeatDelay: 2,
              }
            : ROW_REVEAL
        }
      >
        <span ref={labelRef}>{children}</span>
        {running ? <span aria-hidden="true">{children}</span> : null}
      </motion.span>
    </span>
  );
}

function ResourceMenuAction({
  icon: Icon,
  onSelect,
  children,
}: {
  icon: LucideIcon;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-slot="sidebar-tree-menu-action"
      className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-foreground transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

interface ResourceRowProps {
  row: FlatResource;
  active: boolean;
  expanded: boolean;
  focused: boolean;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  menuOpen: boolean;
  moves: AISidebarMoveCommands;
  renaming: boolean;
  labels: AISidebarTreeLabels;
  onDragEnd: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>, row: FlatResource) => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>, id: string) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onMenuOpenChange: (open: boolean) => void;
  onRenameCancel: () => void;
  onRenameCommit: (label: string) => void;
  onRenameStart: () => void;
  onSelect: () => void;
  onToggle: () => void;
  renderIcon?: (item: AISidebarResource) => React.ReactNode;
  renderMenu?: AISidebarTreeProps["renderMenu"];
  setRef: (node: HTMLDivElement | null) => void;
}

function ResourceRow({
  row,
  active,
  expanded,
  focused,
  draggingId,
  dropTarget,
  menuOpen,
  moves,
  renaming,
  labels,
  onDragEnd,
  onDragOver,
  onDragStart,
  onDrop,
  onFocus,
  onKeyDown,
  onMenuOpenChange,
  onRenameCancel,
  onRenameCommit,
  onRenameStart,
  onSelect,
  onToggle,
  renderIcon,
  renderMenu,
  setRef,
}: ResourceRowProps) {
  const reduce = useReducedMotion() ?? false;
  const canTouch = useTouchCapable();
  const [hovered, setHovered] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const skipRenameBlurRef = React.useRef(false);
  const draggedRef = React.useRef(false);
  const [draft, setDraft] = React.useState(row.item.label);
  const acceptsChildren = canContain(row.item);
  const isDragging = draggingId === row.item.id;
  const dropPosition =
    dropTarget?.id === row.item.id ? dropTarget.position : null;

  React.useEffect(() => {
    if (!renaming) return;
    skipRenameBlurRef.current = false;
    setDraft(row.item.label);
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [renaming, row.item.label]);

  const runFromMenu = (action: () => void) => () => {
    onMenuOpenChange(false);
    action();
  };

  const menu = renderMenu?.(row.item, {
    close: () => onMenuOpenChange(false),
    rename: () => {
      onMenuOpenChange(false);
      onRenameStart();
    },
    moves,
  }) ?? (
    <>
      <ResourceMenuAction
        icon={PencilIcon}
        onSelect={runFromMenu(onRenameStart)}
      >
        {labels.rename}
      </ResourceMenuAction>
      {moves.up || moves.down || moves.into || moves.out ? (
        <div aria-hidden="true" className="my-1 h-px bg-border" />
      ) : null}
      {moves.up ? (
        <ResourceMenuAction icon={ArrowUpIcon} onSelect={runFromMenu(moves.up)}>
          {labels.moveUp}
        </ResourceMenuAction>
      ) : null}
      {moves.down ? (
        <ResourceMenuAction
          icon={ArrowDownIcon}
          onSelect={runFromMenu(moves.down)}
        >
          {labels.moveDown}
        </ResourceMenuAction>
      ) : null}
      {moves.into ? (
        <ResourceMenuAction
          icon={FolderInputIcon}
          onSelect={runFromMenu(moves.into.run)}
        >
          {labels.moveInto(moves.into.label)}
        </ResourceMenuAction>
      ) : null}
      {moves.out ? (
        <ResourceMenuAction icon={Undo2Icon} onSelect={runFromMenu(moves.out)}>
          {labels.moveOut}
        </ResourceMenuAction>
      ) : null}
    </>
  );

  return (
    <motion.div
      ref={setRef}
      layout="position"
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-selected={acceptsChildren ? undefined : active}
      aria-expanded={acceptsChildren ? expanded : undefined}
      aria-disabled={row.item.disabled || undefined}
      tabIndex={focused ? 0 : -1}
      draggable={!row.item.disabled && !renaming}
      data-slot="sidebar-tree-row"
      data-kind={row.item.kind}
      data-active={(!acceptsChildren && active) || undefined}
      data-menu-open={menuOpen || undefined}
      data-drop={dropPosition ?? undefined}
      data-dragging={isDragging || undefined}
      onFocus={onFocus}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          draggedRef.current ||
          renaming ||
          row.item.disabled
        )
          return;
        if (acceptsChildren) onToggle();
        else onSelect();
      }}
      onDoubleClick={(event) => {
        if (acceptsChildren || row.item.disabled) return;
        event.preventDefault();
        onRenameStart();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // The capture variants reach the DOM; `onDragStart` itself is motion's
      // own pan gesture.
      onDragStartCapture={(event) => {
        draggedRef.current = true;
        onDragStart(event, row.item.id);
      }}
      onDragEndCapture={() => {
        onDragEnd();
        requestAnimationFrame(() => {
          draggedRef.current = false;
        });
      }}
      onDragOver={(event) => onDragOver(event, row)}
      onDrop={onDrop}
      className={cn(
        "group/resource relative flex min-h-9 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl pr-3 text-sm outline-none",
        "text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "focus-visible:bg-sidebar-accent/70 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
        "data-[menu-open=true]:bg-sidebar-accent data-[menu-open=true]:text-sidebar-accent-foreground",
        "data-[dragging=true]:opacity-40",
        "data-[drop=inside]:bg-primary/10 data-[drop=inside]:ring-1 data-[drop=inside]:ring-primary/45",
        "data-[drop=before]:before:absolute data-[drop=before]:before:-top-0.5 data-[drop=before]:before:right-2 data-[drop=before]:before:left-2 data-[drop=before]:before:h-0.5 data-[drop=before]:before:rounded-full data-[drop=before]:before:bg-primary",
        "data-[drop=after]:after:absolute data-[drop=after]:after:-bottom-0.5 data-[drop=after]:after:right-2 data-[drop=after]:after:left-2 data-[drop=after]:after:h-0.5 data-[drop=after]:after:rounded-full data-[drop=after]:after:bg-primary",
        !acceptsChildren &&
          active &&
          "bg-sidebar-accent text-sidebar-accent-foreground",
        row.item.disabled && "cursor-not-allowed opacity-45"
      )}
      style={{ paddingLeft: `${12 + row.depth * 16}px` }}
    >
      <span
        aria-hidden="true"
        data-slot="sidebar-tree-icon"
        className="grid size-5 shrink-0 place-items-center"
      >
        {renderIcon?.(row.item) ?? defaultIcon(row.item, expanded)}
      </span>

      {renaming ? (
        <input
          ref={inputRef}
          value={draft}
          aria-label={labels.renameField(row.item.label)}
          data-slot="sidebar-tree-rename"
          onChange={(event) => setDraft(event.target.value)}
          draggable={false}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onBlur={() => {
            if (!skipRenameBlurRef.current) onRenameCommit(draft);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              skipRenameBlurRef.current = true;
              onRenameCommit(draft);
            }
            if (event.key === "Escape") {
              skipRenameBlurRef.current = true;
              onRenameCancel();
            }
          }}
          className="mx-1 h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      ) : (
        <MarqueeLabel active={hovered || menuOpen}>{row.item.label}</MarqueeLabel>
      )}

      {!renaming && !row.item.disabled ? (
        <Popover open={menuOpen} onOpenChange={onMenuOpenChange}>
          <PopoverTrigger
            render={
              <button
                type="button"
                draggable={false}
                tabIndex={-1}
                aria-label={labels.actionsFor(row.item.label)}
                data-slot="sidebar-tree-menu-trigger"
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-lg transition-opacity outline-none hover:bg-foreground/5 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/resource:opacity-100 group-data-[menu-open=true]/resource:opacity-100",
                  // A finger never hovers, and this menu is the only path to
                  // rename and move without a drag — keep it on screen there.
                  canTouch ? "opacity-100" : "opacity-0"
                )}
              />
            }
          >
            <MoreHorizontalIcon aria-hidden="true" className="size-4" />
          </PopoverTrigger>
          {/* The row takes focus back itself when the menu closes. */}
          <PopoverContent
            side="bottom"
            align="end"
            sideOffset={8}
            finalFocus={false}
            data-slot="sidebar-tree-menu"
            className="w-40 gap-0 rounded-xl p-1.5"
          >
            {menu}
          </PopoverContent>
        </Popover>
      ) : null}
    </motion.div>
  );
}

function AISidebarTree({
  items,
  defaultItems = [],
  onItemsChange,
  onMove,
  onMoveError,
  onRename,
  activeId,
  defaultActiveId = null,
  onActiveChange,
  defaultExpandedIds = [],
  renderIcon,
  renderMenu,
  labels: labelOverrides,
  className,
}: AISidebarTreeProps) {
  const labels = React.useMemo<AISidebarTreeLabels>(
    () => ({ ...DEFAULT_TREE_LABELS, ...labelOverrides }),
    [labelOverrides]
  );
  const [internalItems, setInternalItems] = React.useState(
    items ?? defaultItems
  );
  const [internalActiveId, setInternalActiveId] =
    React.useState(defaultActiveId);
  const [expandedIds, setExpandedIds] = React.useState(
    () => new Set(defaultExpandedIds)
  );
  const [focusedId, setFocusedId] = React.useState<string | null>(
    activeId ?? defaultActiveId
  );
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<DropTarget | null>(null);
  const [menuOpenId, setMenuOpenId] = React.useState<string | null>(null);
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState("");
  const rowRefs = React.useRef(new Map<string, HTMLDivElement>());
  const movePendingRef = React.useRef(false);
  const selectedId = activeId ?? internalActiveId;

  // Controlled items replace the optimistic copy the moment they change.
  const [syncedItems, setSyncedItems] = React.useState(items);
  if (items !== syncedItems) {
    setSyncedItems(items);
    if (items) setInternalItems(items);
  }
  const renderedItems = internalItems;

  const flat = React.useMemo(
    () => flattenResources(renderedItems, expandedIds),
    [expandedIds, renderedItems]
  );

  // Which row carries the roving tabindex is resolved during render, never in
  // a passive effect: an effect lands after the browser paints, so the first
  // commit — and, on a server-rendered page, the markup itself — would have no
  // tabbable row and Tab would skip the whole tree. The same hole opens again
  // whenever a collapse or a rolled-back move takes the focused row out of it.
  const focusedRow =
    focusedId !== null && flat.some((row) => row.item.id === focusedId)
      ? focusedId
      : (flat[0]?.item.id ?? null);
  if (focusedId !== focusedRow) setFocusedId(focusedRow);

  const updateItems = React.useCallback(
    (next: AISidebarResource[]) => {
      setInternalItems(next);
      onItemsChange?.(next);
    },
    [onItemsChange]
  );

  const performMove = React.useCallback(
    async (move: AISidebarResourceMove) => {
      if (movePendingRef.current) {
        setAnnouncement(labels.movePending);
        return;
      }
      const before = renderedItems;
      const next = moveResource(before, move);
      if (!next || next === before) return;

      movePendingRef.current = true;
      updateItems(next);
      setDropTarget(null);
      setDraggingId(null);
      const moved = findResource(before, move.itemId);
      const movedLabel = moved?.label ?? labels.item;
      const target = move.targetId ? findResource(before, move.targetId) : null;
      setAnnouncement(
        target
          ? labels.moved(movedLabel, move.position, target.label)
          : labels.movedToTopLevel(movedLabel)
      );

      try {
        await onMove?.(move);
      } catch (error) {
        updateItems(before);
        setAnnouncement(labels.moveFailed(movedLabel));
        onMoveError?.(error, move);
      } finally {
        movePendingRef.current = false;
      }
    },
    [labels, onMove, onMoveError, renderedItems, updateItems]
  );

  const focusRow = React.useCallback((id: string) => {
    setFocusedId(id);
    requestAnimationFrame(() => rowRefs.current.get(id)?.focus());
  }, []);

  const select = React.useCallback(
    (id: string) => {
      if (activeId === undefined) setInternalActiveId(id);
      onActiveChange?.(id);
    },
    [activeId, onActiveChange]
  );

  const toggle = React.useCallback((id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // The same four moves `Alt+Shift+Arrow` performs, handed to the row menu so
  // they survive on a device with no drag and no modifier keys.
  const moveCommands = React.useCallback(
    (row: FlatResource): AISidebarMoveCommands => {
      if (row.item.disabled) return {};
      const index = flat.findIndex(({ item }) => item.id === row.item.id);
      const previous = flat[index - 1];
      const next = flat[index + 1];
      const parentId = row.parentId;
      const commands: AISidebarMoveCommands = {};

      if (previous) {
        commands.up = () =>
          void performMove({
            itemId: row.item.id,
            targetId: previous.item.id,
            position: "before",
          });
      }
      if (next) {
        commands.down = () =>
          void performMove({
            itemId: row.item.id,
            targetId: next.item.id,
            position: "after",
          });
      }
      // Only offer the reparent when it lands somewhere new — the row above a
      // folder's first child is the folder it already lives in.
      if (
        previous &&
        canContain(previous.item) &&
        previous.item.id !== parentId
      ) {
        commands.into = {
          label: previous.item.label,
          run: () => {
            setExpandedIds((current) =>
              new Set(current).add(previous.item.id)
            );
            void performMove({
              itemId: row.item.id,
              targetId: previous.item.id,
              position: "inside",
            });
          },
        };
      }
      if (parentId) {
        commands.out = () =>
          void performMove({
            itemId: row.item.id,
            targetId: parentId,
            position: "after",
          });
      }

      return commands;
    },
    [flat, performMove]
  );

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, row: FlatResource) => {
      const index = flat.findIndex(({ item }) => item.id === row.item.id);
      const previous = flat[index - 1];
      const next = flat[index + 1];
      const last = flat[flat.length - 1];
      const moveModifier = event.altKey && event.shiftKey;

      if (event.key === "ArrowDown" && !moveModifier && next) {
        event.preventDefault();
        focusRow(next.item.id);
        return;
      }
      if (event.key === "ArrowUp" && !moveModifier && previous) {
        event.preventDefault();
        focusRow(previous.item.id);
        return;
      }
      if (event.key === "Home" && flat[0]) {
        event.preventDefault();
        focusRow(flat[0].item.id);
        return;
      }
      if (event.key === "End" && last) {
        event.preventDefault();
        focusRow(last.item.id);
        return;
      }

      if (row.item.disabled) {
        if (event.key === "ArrowLeft" && row.parentId) {
          event.preventDefault();
          focusRow(row.parentId);
        } else if (
          moveModifier ||
          ["ArrowRight", "Enter", " ", "F2", "ContextMenu"].includes(
            event.key
          ) ||
          (event.shiftKey && event.key === "F10")
        ) {
          event.preventDefault();
        }
        return;
      }

      if (moveModifier && event.key === "ArrowUp" && previous) {
        event.preventDefault();
        void performMove({
          itemId: row.item.id,
          targetId: previous.item.id,
          position: "before",
        });
        return;
      }
      if (moveModifier && event.key === "ArrowDown" && next) {
        event.preventDefault();
        void performMove({
          itemId: row.item.id,
          targetId: next.item.id,
          position: "after",
        });
        return;
      }
      if (
        moveModifier &&
        event.key === "ArrowRight" &&
        previous &&
        canContain(previous.item)
      ) {
        event.preventDefault();
        setExpandedIds((current) => new Set(current).add(previous.item.id));
        void performMove({
          itemId: row.item.id,
          targetId: previous.item.id,
          position: "inside",
        });
        return;
      }
      if (moveModifier && event.key === "ArrowLeft" && row.parentId) {
        event.preventDefault();
        void performMove({
          itemId: row.item.id,
          targetId: row.parentId,
          position: "after",
        });
        return;
      }

      if (event.key === "ArrowRight" && canContain(row.item)) {
        event.preventDefault();
        if (!expandedIds.has(row.item.id)) toggle(row.item.id);
        else if (next?.parentId === row.item.id) focusRow(next.item.id);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        if (expandedIds.has(row.item.id)) toggle(row.item.id);
        else if (row.parentId) focusRow(row.parentId);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (canContain(row.item)) toggle(row.item.id);
        else select(row.item.id);
      } else if (event.key === "F2") {
        event.preventDefault();
        setRenamingId(row.item.id);
      } else if (
        event.key === "ContextMenu" ||
        (event.shiftKey && event.key === "F10")
      ) {
        event.preventDefault();
        setMenuOpenId(row.item.id);
      }
    },
    [expandedIds, flat, focusRow, performMove, select, toggle]
  );

  return (
    <>
      <div
        role="tree"
        aria-label={labels.tree}
        aria-multiselectable="false"
        data-slot="sidebar-tree"
        onDragOver={(event) => {
          if (!draggingId || event.target !== event.currentTarget) return;
          event.preventDefault();
          setDropTarget({ id: null, position: "after" });
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (draggingId && dropTarget) {
            void performMove({
              itemId: draggingId,
              targetId: dropTarget.id,
              position: dropTarget.position,
            });
          }
        }}
        className={cn(
          "relative flex min-w-0 flex-col gap-0.5 [overflow-anchor:none] group-data-[state=collapsed]/sidebar:hidden",
          draggingId && "select-none pb-9",
          className
        )}
      >
        <AnimatePresence initial={false}>
          {flat.map((row) => (
            <ResourceRow
              key={row.item.id}
              row={row}
              active={selectedId === row.item.id}
              expanded={expandedIds.has(row.item.id)}
              focused={focusedRow === row.item.id}
              draggingId={draggingId}
              dropTarget={dropTarget}
              menuOpen={menuOpenId === row.item.id}
              moves={moveCommands(row)}
              renaming={renamingId === row.item.id}
              labels={labels}
              onFocus={() => setFocusedId(row.item.id)}
              onSelect={() => select(row.item.id)}
              onToggle={() => toggle(row.item.id)}
              onKeyDown={(event) => handleKeyDown(event, row)}
              onRenameStart={() => setRenamingId(row.item.id)}
              onRenameCancel={() => setRenamingId(null)}
              onRenameCommit={(label) => {
                const trimmed = label.trim();
                setRenamingId(null);
                if (!trimmed || trimmed === row.item.label) return;
                const before = renderedItems;
                updateItems(renameResource(before, row.item.id, trimmed));
                void Promise.resolve(onRename?.(row.item, trimmed)).catch(
                  () => {
                    updateItems(before);
                    setAnnouncement(labels.renameFailed(row.item.label));
                  }
                );
              }}
              onMenuOpenChange={(open) => {
                setMenuOpenId(open ? row.item.id : null);
                if (!open) focusRow(row.item.id);
              }}
              onDragStart={(event, id) => {
                setDraggingId(id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", id);
              }}
              onDragEnd={() => {
                setDraggingId(null);
                setDropTarget(null);
              }}
              onDragOver={(event, targetRow) => {
                if (!draggingId || draggingId === targetRow.item.id) return;
                const source = findResource(renderedItems, draggingId);
                if (source && containsResource(source, targetRow.item.id))
                  return;
                event.preventDefault();
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                const ratio = (event.clientY - rect.top) / rect.height;
                const position: AISidebarDropPosition =
                  !targetRow.item.disabled &&
                  canContain(targetRow.item) &&
                  ratio >= 0.25 &&
                  ratio <= 0.75
                    ? "inside"
                    : ratio < 0.5
                      ? "before"
                      : "after";
                setDropTarget({ id: targetRow.item.id, position });
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (draggingId && dropTarget) {
                  void performMove({
                    itemId: draggingId,
                    targetId: dropTarget.id,
                    position: dropTarget.position,
                  });
                }
              }}
              renderIcon={renderIcon}
              renderMenu={renderMenu}
              setRef={(node) => {
                if (node) rowRefs.current.set(row.item.id, node);
                else rowRefs.current.delete(row.item.id);
              }}
            />
          ))}
        </AnimatePresence>

        {draggingId ? (
          <div
            aria-hidden="true"
            data-active={dropTarget?.id === null || undefined}
            data-slot="sidebar-tree-root-drop"
            className="absolute inset-x-1 bottom-0 flex h-8 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground data-[active=true]:border-primary/50 data-[active=true]:bg-primary/10 data-[active=true]:text-foreground"
          >
            {labels.moveToTopLevel}
          </div>
        ) : null}
      </div>
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </>
  );
}

export {
  AISidebarProvider,
  useAISidebar,
  useSidebarPanel as useAISidebarPanel,
  AISidebar,
  AISidebarTrigger,
  AISidebarClose,
  AISidebarRail,
  AISidebarInset,
  AISidebarHeader,
  AISidebarContent,
  AISidebarFooter,
  AISidebarSection,
  AISidebarMenu,
  AISidebarMenuItem,
  AISidebarItem,
  AISidebarSubmenu,
  AISidebarSubItem,
  AISidebarTree,
  DEFAULT_TREE_LABELS as AI_SIDEBAR_TREE_LABELS,
};
