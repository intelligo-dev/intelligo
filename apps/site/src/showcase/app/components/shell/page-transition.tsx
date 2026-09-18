"use client";

/**
 * The page region of the shell. Moving between sections — dashboard to
 * chat, chat to artifacts — lifts the new page in; moving inside one
 * (a conversation to the next, a settings tab to another) does not,
 * because the section's own layout owns that motion.
 *
 * It animates in place rather than keying on the route, so nothing under
 * it remounts: a layout's state survives the navigation.
 */

import * as React from "react";
import { useAnimate, useReducedMotion } from "motion/react";

import { EASE_OUT } from "@showcase/components/ui/ai-motion";
import { usePathname } from "@showcase/i18n/navigation";
import { cn } from "@showcase/lib/utils";

function sectionOf(pathname: string | null) {
  return pathname?.split("/").filter(Boolean)[0] ?? "";
}

export function PageTransition({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const reduced = useReducedMotion() ?? false;
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const section = sectionOf(pathname);
  const previous = React.useRef(section);

  React.useEffect(() => {
    if (previous.current === section) return;
    previous.current = section;
    scope.current?.scrollTo({ top: 0 });
    if (reduced) return;
    const element = scope.current;
    // Cleared after: a leftover transform would make this region the
    // containing block of every fixed-position element inside the page.
    void animate(
      element,
      { opacity: [0, 1], y: [8, 0] },
      { duration: 0.36, ease: EASE_OUT }
    ).then(() => {
      element.style.transform = "";
      element.style.opacity = "";
    });
  }, [animate, reduced, scope, section]);

  return (
    <div ref={scope} data-slot="page" className={cn(className)}>
      {children}
    </div>
  );
}
