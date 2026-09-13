"use client";

/*
 * 
 */

import * as React from "react";
import { type BundledLanguage, codeToHtml, type ShikiTransformer } from "shiki";

import { CopyButton } from "@showcase/components/ui/copy-button";
import { cn } from "@showcase/lib/utils";

// Changes: copy goes through the T4 copy-button with the caller's labels;
// highlighting re-runs when the code changes (upstream highlighted once);
// the plain code shows until the highlighted HTML is ready.

type CodeBlockContextValue = { code: string };

const CodeBlockContext = React.createContext<CodeBlockContextValue>({
  code: "",
});

const lineNumbers: ShikiTransformer = {
  name: "line-numbers",
  line(node, line) {
    node.children.unshift({
      type: "element",
      tagName: "span",
      properties: {
        className: [
          "inline-block",
          "min-w-10",
          "mr-4",
          "text-right",
          "select-none",
          "text-muted-foreground",
        ],
      },
      children: [{ type: "text", value: String(line) }],
    });
  },
};

async function highlightCode(
  code: string,
  language: BundledLanguage,
  showLineNumbers = false
): Promise<[light: string, dark: string]> {
  const transformers = showLineNumbers ? [lineNumbers] : [];
  return Promise.all([
    codeToHtml(code, { lang: language, theme: "one-light", transformers }),
    codeToHtml(code, { lang: language, theme: "one-dark-pro", transformers }),
  ]);
}

const HIGHLIGHTED =
  "overflow-auto [&_code]:font-mono [&_code]:text-sm [&>pre]:m-0 [&>pre]:bg-transparent! [&>pre]:p-4 [&>pre]:text-sm";

function CodeBlock({
  code,
  language,
  showLineNumbers = false,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  code: string;
  language: BundledLanguage;
  showLineNumbers?: boolean;
}) {
  const [html, setHtml] = React.useState<[string, string] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    highlightCode(code, language, showLineNumbers).then((result) => {
      if (!cancelled) setHtml(result);
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, showLineNumbers]);

  return (
    <CodeBlockContext.Provider value={{ code }}>
      <div
        data-slot="code-block"
        className={cn(
          "group/code-block relative w-full overflow-hidden rounded-lg border bg-background text-foreground",
          className
        )}
        {...props}
      >
        {html ? (
          <>
            <div
              className={cn(HIGHLIGHTED, "dark:hidden")}
              dangerouslySetInnerHTML={{ __html: html[0] }}
            />
            <div
              className={cn(HIGHLIGHTED, "hidden dark:block")}
              dangerouslySetInnerHTML={{ __html: html[1] }}
            />
          </>
        ) : (
          <pre className="m-0 overflow-auto p-4 font-mono text-sm">
            <code>{code}</code>
          </pre>
        )}
        {children && (
          <div
            data-slot="code-block-actions"
            className="absolute top-2 right-2 flex items-center gap-1"
          >
            {children}
          </div>
        )}
      </div>
    </CodeBlockContext.Provider>
  );
}

function CodeBlockCopyButton(
  props: Omit<React.ComponentProps<typeof CopyButton>, "value">
) {
  const { code } = React.useContext(CodeBlockContext);
  return <CopyButton data-slot="code-block-copy" value={code} {...props} />;
}

export { CodeBlock, CodeBlockCopyButton, highlightCode };
