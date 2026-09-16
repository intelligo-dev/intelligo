/**
 * Live demos of Intelligo's own components (T3 AI parts, T4 patterns),
 * rendered from the registry source the sync copies into
 * src/showcase/app — the files `shadcn add` installs. A component with
 * no demo yet, or one whose demo throws, shows a quiet placeholder
 * instead of taking the page's island down.
 */
import { Component, type ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CONVERSATION_DEMOS } from "./conversation";
import { AGENT_DEMOS } from "./agent";
import { OUTPUT_DEMOS } from "./output";

const DEMOS: Record<string, () => ReactNode> = {
  ...CONVERSATION_DEMOS,
  ...AGENT_DEMOS,
  ...OUTPUT_DEMOS,
};

class Guard extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Placeholder>The {this.props.name} demo failed to render.</Placeholder>
    ) : (
      this.props.children
    );
  }
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 items-center justify-center p-6 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function IntelligoDemo({ name }: { name: string }) {
  const Demo = DEMOS[name];
  return (
    <div className="rounded-lg border bg-background p-5 text-foreground md:p-6">
      {Demo ? (
        <Guard name={name}>
          <TooltipProvider>
            <Demo />
          </TooltipProvider>
        </Guard>
      ) : (
        <Placeholder>
          No live demo yet — install it and see it in its block.
        </Placeholder>
      )}
    </div>
  );
}
