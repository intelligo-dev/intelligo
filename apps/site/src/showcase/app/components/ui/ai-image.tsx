"use client";

/*
 * A generated or attached image
 * that reserves its space before the bytes arrive, so a reply does not
 * jump when the picture lands — the reason agentui.pro's image surface
 * exists, authored here on tokens.
 */

import * as React from "react";
import { ImageIcon } from "lucide-react";

import { cn } from "@showcase/lib/utils";

function AIImage({
  src,
  alt,
  aspectRatio = "4 / 3",
  loading = "lazy",
  className,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "alt"> & {
  /** A data URL, an https URL, or nothing yet. */
  src?: string;
  alt: string;
  /** CSS `aspect-ratio`, reserved until the image loads. */
  aspectRatio?: string;
}) {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  return (
    <div
      data-slot="ai-image"
      data-state={failed ? "error" : loaded ? "loaded" : "loading"}
      className={cn(
        "relative w-full max-w-md overflow-hidden rounded-lg border bg-muted",
        className
      )}
      style={{ aspectRatio }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "size-full object-cover transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0"
          )}
          {...props}
        />
      ) : null}
      {!loaded || failed ? (
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 flex items-center justify-center text-muted-foreground",
            !failed && "shimmer"
          )}
        >
          <ImageIcon className="size-6" />
        </div>
      ) : null}
    </div>
  );
}

export { AIImage };
