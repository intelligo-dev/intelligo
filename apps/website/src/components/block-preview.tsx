import { useEffect, useState } from "react";
import { Showcase, SCENE_FOR_ITEM, type SceneId } from "@/showcase/scenes";
import { BrowserFrame } from "@/components/browser-frame";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * One registry block, live: the real component `shadcn add` installs,
 * with its own messages/en and fixture data. The scene mounts after
 * hydration so the static HTML stays a light placeholder. An item with
 * no scene of its own (chat-panel renders inside chat) shows the scene
 * of the item it requires.
 */
export function BlockPreview({
  name,
  dependsOn = [],
  className,
  bodyClassName = "aspect-[16/10] w-full",
}: {
  name: string;
  dependsOn?: string[];
  className?: string;
  bodyClassName?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const scene: SceneId =
    SCENE_FOR_ITEM[name] ??
    dependsOn.map((d) => SCENE_FOR_ITEM[d]).find(Boolean) ??
    "dashboard";

  return (
    <TooltipProvider>
      <BrowserFrame
        className={cn("w-full", className)}
        messages={`messages/en/${name}.json`}
        bodyClassName={bodyClassName}
        label={`Preview of the ${name} block`}
      >
        {mounted ? (
          <Showcase scene={scene} toaster={false} />
        ) : (
          <div className="mono absolute inset-0 flex animate-pulse items-center justify-center bg-muted text-[0.72rem] text-muted-foreground">
            Loading preview…
          </div>
        )}
      </BrowserFrame>
    </TooltipProvider>
  );
}
