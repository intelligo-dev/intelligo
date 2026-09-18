"use client";

/*
 * The picker a composer opens for `/` commands and `@` mentions: a Command
 * list that sits above the textarea, filtered by what was typed after the
 * trigger. Presentation only — the trigger detection lives with the
 * composer. Positioned in flow (absolute, above its `relative` parent)
 * rather than in a popup, so focus never leaves the textarea while the
 * reader keeps typing.
 */

import * as React from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@ui/components/ui/command";
import { cn } from "@ui/lib/utils";

export type ComposerMenuOption = {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  /** Grouped under this heading when given. */
  group?: string;
};

function ComposerMenu({
  open,
  options,
  query,
  onSelect,
  emptyLabel,
  className,
}: {
  open: boolean;
  options: ComposerMenuOption[];
  /** What was typed after the trigger, for the filter. */
  query: string;
  onSelect: (option: ComposerMenuOption) => void;
  emptyLabel: string;
  className?: string;
}) {
  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options;
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(needle) ||
        option.value.toLowerCase().includes(needle) ||
        option.description?.toLowerCase().includes(needle)
    );
  }, [options, query]);

  const groups = React.useMemo(() => {
    const map = new Map<string, ComposerMenuOption[]>();
    for (const option of filtered) {
      const key = option.group ?? "";
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()];
  }, [filtered]);

  if (!open) return null;

  return (
    <div
      data-slot="composer-menu"
      role="presentation"
      className={cn(
        "absolute bottom-full left-0 z-50 mb-2 w-80 max-w-full overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-md",
        className
      )}
    >
      <Command shouldFilter={false} loop>
        <CommandList className="max-h-64">
          <CommandEmpty>{emptyLabel}</CommandEmpty>
          {groups.map(([group, items]) => (
            <CommandGroup key={group} heading={group || undefined}>
              {items.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => onSelect(option)}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {option.icon}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{option.label}</span>
                    {option.description ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Command>
    </div>
  );
}

export { ComposerMenu };
