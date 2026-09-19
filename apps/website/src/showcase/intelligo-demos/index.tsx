/**
 * The live demo for any component on /components, rendered from the
 * registry source the sync copies into src/showcase/app — the files
 * `shadcn add` installs. Every demo sits in the same frame. A component
 * with no demo yet, or one whose demo throws, shows a quiet placeholder
 * instead of taking the page's island down.
 */
import { Component, type ReactNode } from "react";
import { TooltipProvider } from "@showcase/components/ui/tooltip";
import { PRIMITIVE_DEMOS } from "../primitives";
import { CONVERSATION_DEMOS } from "./conversation";
import { AGENT_DEMOS } from "./agent";
import { OUTPUT_DEMOS } from "./output";
import { CONTROL_DEMOS } from "./controls";

const DEMOS: Record<string, () => ReactNode> = {
  ...PRIMITIVE_DEMOS,
  ...CONVERSATION_DEMOS,
  ...AGENT_DEMOS,
  ...OUTPUT_DEMOS,
  ...CONTROL_DEMOS,
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
    <p className="w-full text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function ComponentDemo({ name }: { name: string }) {
  const Demo = DEMOS[name];
  return (
    <div className="flex min-h-40 items-center rounded-xl border bg-background p-6 text-foreground md:p-8">
      <div className="w-full min-w-0">
        {Demo ? (
          <Guard name={name}>
            <TooltipProvider>
              <Demo />
            </TooltipProvider>
          </Guard>
        ) : (
          <Placeholder>No live demo yet.</Placeholder>
        )}
      </div>
    </div>
  );
}
