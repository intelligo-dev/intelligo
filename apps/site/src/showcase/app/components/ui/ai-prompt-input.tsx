"use client";

/*
 * 
 */

import * as React from "react";
import type { ChatStatus, FileUIPart } from "ai";
import {
  ArrowUpIcon,
  ImageIcon,
  PaperclipIcon,
  PlusIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@showcase/components/ui/attachment";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@showcase/components/ui/dropdown-menu";
import { Button } from "@showcase/components/ui/button";
import { SPRING_SWAP } from "@showcase/components/ui/ai-motion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@showcase/components/ui/select";
import { Spinner } from "@showcase/components/ui/spinner";
import { cn } from "@showcase/lib/utils";

// Changes: the composer surface only — form, textarea, attachments, action
// menu, selects and submit. Attachments preview with shadcn's Attachment
// instead of a HoverCard; the speech button, the command-based pickers and
// the external PromptInputProvider are not ported. Errors report a code and
// every label is passed in, so nothing is English by default. File ids come
// from crypto.randomUUID, not nanoid. Menu items act on click (Base UI).
// The surface follows the MIT-licensed prompt input: one rounded field, the textarea growing with its content, a
// bottom row of quiet controls and a round send button that morphs into
// stop while a reply streams.

type AttachmentFile = FileUIPart & { id: string };

type AttachmentsContextValue = {
  files: AttachmentFile[];
  add: (files: File[] | FileList) => void;
  remove: (id: string) => void;
  clear: () => void;
  openFileDialog: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
};

const AttachmentsContext = React.createContext<AttachmentsContextValue | null>(
  null
);

function usePromptInputAttachments() {
  const context = React.useContext(AttachmentsContext);
  if (!context) {
    throw new Error(
      "usePromptInputAttachments must be used within a PromptInput"
    );
  }
  return context;
}

type PromptInputMessage = {
  text: string;
  files: FileUIPart[];
};

type PromptInputError = { code: "max_files" | "max_file_size" | "accept" };

function matchesAccept(file: File, accept?: string) {
  if (!accept || accept.trim() === "") return true;
  return accept
    .split(",")
    .map((pattern) => pattern.trim())
    .filter(Boolean)
    .some((pattern) =>
      pattern.endsWith("/*")
        ? file.type.startsWith(pattern.slice(0, -1))
        : file.type === pattern
    );
}

async function blobUrlToDataUrl(url: string): Promise<string | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function PromptInput({
  className,
  accept,
  multiple,
  globalDrop = false,
  maxFiles,
  maxFileSize,
  onError,
  onSubmit,
  children,
  ...props
}: Omit<React.ComponentProps<"form">, "onSubmit" | "onError"> & {
  /** e.g. "image/*"; any type when omitted. */
  accept?: string;
  multiple?: boolean;
  /** Accept drops anywhere on the page, not only on the composer. */
  globalDrop?: boolean;
  maxFiles?: number;
  /** In bytes. */
  maxFileSize?: number;
  onError?: (error: PromptInputError) => void;
  onSubmit: (
    message: PromptInputMessage,
    event: React.FormEvent<HTMLFormElement>
  ) => void | Promise<void>;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const [files, setFiles] = React.useState<AttachmentFile[]>([]);
  const filesRef = React.useRef(files);
  filesRef.current = files;

  const add = React.useCallback(
    (fileList: File[] | FileList) => {
      const incoming = Array.from(fileList);
      const accepted = incoming.filter((file) => matchesAccept(file, accept));
      if (incoming.length && accepted.length === 0) {
        onError?.({ code: "accept" });
        return;
      }
      const sized = accepted.filter((file) =>
        maxFileSize ? file.size <= maxFileSize : true
      );
      if (accepted.length > 0 && sized.length === 0) {
        onError?.({ code: "max_file_size" });
        return;
      }
      setFiles((previous) => {
        const capacity =
          typeof maxFiles === "number"
            ? Math.max(0, maxFiles - previous.length)
            : undefined;
        const capped =
          typeof capacity === "number" ? sized.slice(0, capacity) : sized;
        if (typeof capacity === "number" && sized.length > capacity) {
          onError?.({ code: "max_files" });
        }
        return previous.concat(
          capped.map((file) => ({
            id: crypto.randomUUID(),
            type: "file" as const,
            url: URL.createObjectURL(file),
            mediaType: file.type,
            filename: file.name,
          }))
        );
      });
    },
    [accept, maxFiles, maxFileSize, onError]
  );

  const remove = React.useCallback((id: string) => {
    setFiles((previous) => {
      const found = previous.find((file) => file.id === id);
      if (found?.url) URL.revokeObjectURL(found.url);
      return previous.filter((file) => file.id !== id);
    });
  }, []);

  const clear = React.useCallback(() => {
    setFiles((previous) => {
      for (const file of previous) {
        if (file.url) URL.revokeObjectURL(file.url);
      }
      return [];
    });
  }, []);

  const openFileDialog = React.useCallback(() => inputRef.current?.click(), []);

  // Drops land on the composer, or anywhere on the page with globalDrop.
  React.useEffect(() => {
    const target: HTMLElement | Document | null = globalDrop
      ? document
      : formRef.current;
    if (!target) return;
    const onDragOver = (event: Event) => {
      if ((event as DragEvent).dataTransfer?.types?.includes("Files")) {
        event.preventDefault();
      }
    };
    const onDrop = (event: Event) => {
      const transfer = (event as DragEvent).dataTransfer;
      if (transfer?.types?.includes("Files")) event.preventDefault();
      if (transfer?.files && transfer.files.length > 0) add(transfer.files);
    };
    target.addEventListener("dragover", onDragOver);
    target.addEventListener("drop", onDrop);
    return () => {
      target.removeEventListener("dragover", onDragOver);
      target.removeEventListener("drop", onDrop);
    };
  }, [add, globalDrop]);

  // Revoke object URLs on unmount.
  React.useEffect(
    () => () => {
      for (const file of filesRef.current) {
        if (file.url) URL.revokeObjectURL(file.url);
      }
    },
    []
  );

  const context = React.useMemo<AttachmentsContextValue>(
    () => ({
      files,
      add,
      remove,
      clear,
      openFileDialog,
      fileInputRef: inputRef,
    }),
    [files, add, remove, clear, openFileDialog]
  );

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = (new FormData(form).get("message") as string) || "";
    // Reset before the async conversion so typing during it is not lost.
    form.reset();

    Promise.all(
      files.map(async ({ id: _id, ...file }) =>
        file.url?.startsWith("blob:")
          ? { ...file, url: (await blobUrlToDataUrl(file.url)) ?? file.url }
          : file
      )
    )
      .then(async (converted) => {
        await onSubmit({ text, files: converted }, event);
        clear();
      })
      .catch(() => {
        // Keep the attachments so the user can retry.
      });
  }

  return (
    <AttachmentsContext.Provider value={context}>
      <input
        accept={accept}
        className="hidden"
        multiple={multiple}
        onChange={(event) => {
          if (event.currentTarget.files) add(event.currentTarget.files);
          // Allow picking a file that was just removed.
          event.currentTarget.value = "";
        }}
        ref={inputRef}
        tabIndex={-1}
        type="file"
      />
      <form
        data-slot="prompt-input"
        className={cn("w-full", className)}
        onSubmit={handleSubmit}
        ref={formRef}
        {...props}
      >
        <div
          data-slot="prompt-input-surface"
          className="flex w-full flex-col rounded-2xl border border-border/80 bg-background p-2 transition-colors focus-within:border-foreground/25 has-[textarea:disabled]:opacity-60"
        >
          {children}
        </div>
      </form>
    </AttachmentsContext.Provider>
  );
}

function PromptInputBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-body"
      className={cn("contents", className)}
      {...props}
    />
  );
}

function PromptInputTextarea({
  className,
  onKeyDown,
  onPaste,
  ...props
}: React.ComponentProps<"textarea">) {
  const attachments = usePromptInputAttachments();
  const [isComposing, setIsComposing] = React.useState(false);

  // A caller's handlers run first; what they `preventDefault` on, the
  // composer leaves alone (a menu taking Escape, an ArrowUp recall).
  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Enter") {
      if (isComposing || event.nativeEvent.isComposing || event.shiftKey) {
        return;
      }
      event.preventDefault();
      const form = event.currentTarget.form;
      const submit = form?.querySelector<HTMLButtonElement>(
        'button[type="submit"]'
      );
      if (submit?.disabled) return;
      form?.requestSubmit();
    }

    // Backspace in an empty composer removes the last attachment.
    if (
      event.key === "Backspace" &&
      event.currentTarget.value === "" &&
      attachments.files.length > 0
    ) {
      event.preventDefault();
      const last = attachments.files.at(-1);
      if (last) attachments.remove(last.id);
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    const pasted: File[] = [];
    for (const item of event.clipboardData?.items ?? []) {
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) pasted.push(file);
      }
    }
    if (pasted.length > 0) {
      event.preventDefault();
      attachments.add(pasted);
    }
  }

  return (
    <textarea
      data-slot="prompt-input-textarea"
      rows={2}
      className={cn(
        "field-sizing-content block max-h-64 min-h-12 w-full resize-none bg-transparent px-2 pt-1.5 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed",
        className
      )}
      name="message"
      onCompositionEnd={() => setIsComposing(false)}
      onCompositionStart={() => setIsComposing(true)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      {...props}
    />
  );
}

function PromptInputHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-header"
      className={cn("order-first flex flex-wrap items-center gap-1 px-1 pb-1", className)}
      {...props}
    />
  );
}

function PromptInputFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-footer"
      className={cn("mt-1 flex min-h-8 items-center justify-between gap-1", className)}
      {...props}
    />
  );
}

function PromptInputTools({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="prompt-input-tools"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  );
}

function PromptInputButton({
  variant = "ghost",
  size,
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  const iconOnly = React.Children.count(props.children) <= 1;
  return (
    <Button
      data-slot="prompt-input-button"
      size={size ?? (iconOnly ? "icon-sm" : "sm")}
      type="button"
      variant={variant}
      className={cn(
        "rounded-full text-muted-foreground hover:text-foreground",
        iconOnly && "size-8",
        className
      )}
      {...props}
    />
  );
}

function PromptInputAttachments({
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof AttachmentGroup>, "children"> & {
  children: (file: AttachmentFile) => React.ReactNode;
}) {
  const attachments = usePromptInputAttachments();
  if (!attachments.files.length) return null;
  return (
    <AttachmentGroup
      data-slot="prompt-input-attachments"
      className={cn("w-full px-1 pt-1", className)}
      {...props}
    >
      {attachments.files.map((file) => (
        <React.Fragment key={file.id}>{children(file)}</React.Fragment>
      ))}
    </AttachmentGroup>
  );
}

function PromptInputAttachment({
  data,
  removeLabel,
  ...props
}: React.ComponentProps<typeof Attachment> & {
  data: AttachmentFile;
  /** Accessible name of the remove button, e.g. "Remove attachment". */
  removeLabel: string;
}) {
  const attachments = usePromptInputAttachments();
  const isImage = Boolean(data.mediaType?.startsWith("image/") && data.url);

  return (
    <Attachment data-slot="prompt-input-attachment" size="sm" {...props}>
      <AttachmentMedia variant={isImage ? "image" : "icon"}>
        {isImage ? <img src={data.url} alt="" /> : <PaperclipIcon />}
      </AttachmentMedia>
      {data.filename && (
        <AttachmentContent>
          <AttachmentTitle>{data.filename}</AttachmentTitle>
        </AttachmentContent>
      )}
      <AttachmentActions>
        <AttachmentAction
          aria-label={removeLabel}
          onClick={() => attachments.remove(data.id)}
        >
          <XIcon />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  );
}

function PromptInputActionMenu(
  props: React.ComponentProps<typeof DropdownMenu>
) {
  return <DropdownMenu {...props} />;
}

function PromptInputActionMenuTrigger({
  children,
  ...props
}: React.ComponentProps<typeof PromptInputButton>) {
  // The plus turns into a cross while the menu is open — a CSS turn, so
  // it needs no motion gate.
  return (
    <DropdownMenuTrigger
      render={
        <PromptInputButton
          {...props}
          className={cn(
            "[&>svg]:transition-transform [&>svg]:duration-200 aria-expanded:[&>svg]:rotate-45 motion-reduce:[&>svg]:transition-none",
            props.className
          )}
        />
      }
    >
      {children ?? <PlusIcon />}
    </DropdownMenuTrigger>
  );
}

function PromptInputActionMenuContent({
  align = "start",
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      align={align}
      className={cn("w-56 rounded-xl p-1.5", className)}
      {...props}
    />
  );
}

function PromptInputActionMenuItem(
  props: React.ComponentProps<typeof DropdownMenuItem>
) {
  return <DropdownMenuItem {...props} />;
}

function PromptInputActionAddAttachments({
  label,
  ...props
}: React.ComponentProps<typeof DropdownMenuItem> & {
  /** e.g. "Add photos or files". */
  label: string;
}) {
  const attachments = usePromptInputAttachments();
  return (
    <DropdownMenuItem {...props} onClick={() => attachments.openFileDialog()}>
      <ImageIcon /> {label}
    </DropdownMenuItem>
  );
}

function PromptInputSubmit({
  status,
  label,
  variant = "default",
  size = "icon-sm",
  className,
  children,
  ...props
}: React.ComponentProps<typeof Button> & {
  status?: ChatStatus;
  /** Accessible name — "Send", or "Stop" while streaming. */
  label: string;
}) {
  const reduced = useReducedMotion() ?? false;
  const pending = status === "submitted" || status === "streaming";
  let icon = <ArrowUpIcon />;
  if (status === "submitted") icon = <Spinner />;
  else if (status === "streaming") icon = <SquareIcon className="size-3 fill-current" />;
  else if (status === "error") icon = <XIcon />;
  const key = status === "submitted" || status === "streaming" ? "stop" : status === "error" ? "error" : "send";

  return (
    <Button
      data-slot="prompt-input-submit"
      aria-label={label}
      aria-busy={status === "submitted" || undefined}
      size={size}
      // While a reply is pending the button stops it; it never resubmits.
      type={pending ? "button" : "submit"}
      variant={variant}
      className={cn("ml-auto size-8 rounded-full", className)}
      {...props}
    >
      {children ?? (
        // Send and stop trade places with a small pop; reduced motion swaps them plainly.
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={key}
            initial={reduced ? { opacity: 1 } : { opacity: 0, y: 3, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -3, scale: 0.8 }}
            transition={reduced ? { duration: 0 } : SPRING_SWAP}
            className="grid place-items-center [&>svg]:size-4"
          >
            {icon}
          </motion.span>
        </AnimatePresence>
      )}
    </Button>
  );
}

function PromptInputSelect(props: React.ComponentProps<typeof Select>) {
  return <Select {...props} />;
}

function PromptInputSelectTrigger({
  className,
  ...props
}: React.ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn(
        "h-8 max-w-52 rounded-xl border-none bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        className
      )}
      {...props}
    />
  );
}

const PromptInputSelectContent = SelectContent;
const PromptInputSelectItem = SelectItem;
const PromptInputSelectValue = SelectValue;

export {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputHeader,
  PromptInputFooter,
  PromptInputTools,
  PromptInputButton,
  PromptInputAttachments,
  PromptInputAttachment,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionAddAttachments,
  PromptInputSubmit,
  PromptInputSelect,
  PromptInputSelectTrigger,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectValue,
  usePromptInputAttachments,
  type PromptInputMessage,
  type PromptInputError,
};
