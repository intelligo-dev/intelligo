"use client";

/*
 * File upload: a drop zone that lifts under a dragged file and a queue of
 * rows that slide in, fill a progress bar, settle on done or error and
 * fold away on remove — or, compact, a chat composer wrapper with a drop
 * overlay and a row of chips. The list is controlled; the component
 * validates what arrives and reports it.
 */

import * as React from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  FileArchiveIcon,
  FileAudioIcon,
  FileCode2Icon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileVideoIcon,
  PaperclipIcon,
  RotateCcwIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import {
  EASE_OUT,
  SPRING_LAYOUT,
  SPRING_PRESS,
} from "@/components/ui/ai-motion";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
 * The item shape and helpers.
 * ------------------------------------------------------------------------- */

export type FileUploadStatus = "uploading" | "done" | "error";
export type FileRejectReason = "too-large" | "not-accepted" | "max-files";

export interface FileUploadItem {
  id: string;
  /** The picked file; `name`, `size` and `type` fall back to it. */
  file?: File;
  name?: string;
  size?: number;
  type?: string;
  /** 0–100 while uploading; omit for an indeterminate upload. */
  progress?: number;
  status: FileUploadStatus;
  error?: string;
  /** An image thumbnail (an object URL or a remote URL). */
  previewUrl?: string;
}

export interface FileRejection {
  file: File;
  reason: FileRejectReason;
}

/** An item for a freshly picked file, ready to be put into the list. */
export function createFileUploadItem(file: File): FileUploadItem {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
  return { id, file, status: "uploading", progress: 0 };
}

export function formatFileSize(bytes: number | undefined) {
  if (bytes === undefined || !Number.isFinite(bytes) || bytes <= 0)
    return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

function itemName(item: FileUploadItem) {
  return item.name ?? item.file?.name ?? "";
}

function itemSize(item: FileUploadItem) {
  return item.size ?? item.file?.size;
}

function itemType(item: FileUploadItem) {
  return item.type ?? item.file?.type ?? "";
}

function extensionOf(name: string) {
  return name.includes(".") ? (name.split(".").pop()?.toLowerCase() ?? "") : "";
}

function iconFor(item: FileUploadItem) {
  const type = itemType(item);
  const ext = extensionOf(itemName(item));
  if (type.startsWith("image/")) return FileImageIcon;
  if (type.startsWith("video/")) return FileVideoIcon;
  if (type.startsWith("audio/")) return FileAudioIcon;
  if (
    /zip|compressed/.test(type) ||
    ["zip", "rar", "7z", "tar", "gz"].includes(ext)
  )
    return FileArchiveIcon;
  if (/spreadsheet|excel/.test(type) || ["csv", "xls", "xlsx"].includes(ext))
    return FileSpreadsheetIcon;
  if (
    type.includes("pdf") ||
    type.startsWith("text/") ||
    ["pdf", "doc", "docx", "md", "txt"].includes(ext)
  )
    return FileTextIcon;
  if (
    [
      "css",
      "html",
      "js",
      "jsx",
      "json",
      "mdx",
      "ts",
      "tsx",
      "xml",
      "yaml",
      "yml",
    ].includes(ext)
  )
    return FileCode2Icon;
  return FileIcon;
}

/** Whether a file matches an `accept` string (MIME types, `type/*`, `.ext`). */
function matchesAccept(file: File, accept: string | undefined) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith(".")) return name.endsWith(token);
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1));
      return type === token;
    });
}

/* ----------------------------------------------------------------------------
 * Labels. Every visible or announced string, with an English default.
 * ------------------------------------------------------------------------- */

export interface FileUploadLabels {
  title: string;
  /** Under the title; defaults to the size limit when `maxSize` is set. */
  description?: string;
  browse: string;
  limitReached: string;
  dropOverlay: string;
  attach: string;
  input: string;
  maxSize: (size: string) => string;
  remove: (name: string) => string;
  retry: (name: string) => string;
  progress: (name: string) => string;
  status: Record<FileUploadStatus, string>;
}

const DEFAULT_LABELS: FileUploadLabels = {
  title: "Drop files here",
  browse: "Browse",
  limitReached: "Upload limit reached",
  dropOverlay: "Drop files to attach",
  attach: "Attach files",
  input: "Upload files",
  maxSize: (size) => `Up to ${size} per file`,
  remove: (name) => `Remove ${name}`,
  retry: (name) => `Retry ${name}`,
  progress: (name) => `${name} upload progress`,
  status: { uploading: "Uploading", done: "Uploaded", error: "Failed" },
};

/* ----------------------------------------------------------------------------
 * Context: the hidden input and the list, shared with the trigger.
 * ------------------------------------------------------------------------- */

interface FileUploadContextValue {
  open: () => void;
  disabled: boolean;
  labels: FileUploadLabels;
}

const FileUploadContext = React.createContext<FileUploadContextValue | null>(
  null
);

function useFileUploadContext(part: string) {
  const context = React.useContext(FileUploadContext);
  if (!context) throw new Error(`${part} must be used inside <FileUpload>.`);
  return context;
}

/* ----------------------------------------------------------------------------
 * FileUpload.
 * ------------------------------------------------------------------------- */

export interface FileUploadProps {
  /** The list — controlled; add and remove through the callbacks. */
  files: FileUploadItem[];
  /** Files that passed validation. Create items with `createFileUploadItem`. */
  onFilesAdded?: (files: File[]) => void;
  /** Files turned away, with why. */
  onFilesRejected?: (rejections: FileRejection[]) => void;
  onRemove?: (item: FileUploadItem) => void;
  /** Offers a retry on failed items when given. */
  onRetry?: (item: FileUploadItem) => void;
  accept?: string;
  /** Largest accepted file, in bytes. */
  maxSize?: number;
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  /**
   * "default": a drop zone with a queue of rows. "compact": wraps a chat
   * composer (the children) with a drop overlay and a row of chips; open
   * the picker with `<FileUploadTrigger>` inside it.
   */
  variant?: "default" | "compact";
  labels?: Partial<FileUploadLabels>;
  className?: string;
  children?: React.ReactNode;
}

export function FileUpload({
  files,
  onFilesAdded,
  onFilesRejected,
  onRemove,
  onRetry,
  accept,
  maxSize,
  maxFiles,
  multiple = true,
  disabled = false,
  variant = "default",
  labels: labelsProp,
  className,
  children,
}: FileUploadProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp };
  const reduced = useReducedMotion() ?? false;
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);
  const [dragging, setDragging] = React.useState(false);

  const maxReached = maxFiles !== undefined && files.length >= maxFiles;
  const inactive = disabled || maxReached;

  const addFiles = (incoming: File[]) => {
    if (disabled || incoming.length === 0) return;
    const rejections: FileRejection[] = [];
    let slots = maxFiles === undefined ? Infinity : maxFiles - files.length;
    if (!multiple) slots = Math.min(slots, 1);
    const accepted: File[] = [];
    for (const file of incoming) {
      if (!matchesAccept(file, accept)) {
        rejections.push({ file, reason: "not-accepted" });
      } else if (maxSize !== undefined && file.size > maxSize) {
        rejections.push({ file, reason: "too-large" });
      } else if (accepted.length >= slots) {
        rejections.push({ file, reason: "max-files" });
      } else {
        accepted.push(file);
      }
    }
    if (rejections.length > 0) onFilesRejected?.(rejections);
    if (accepted.length > 0) onFilesAdded?.(accepted);
  };

  const open = () => {
    if (!inactive) inputRef.current?.click();
  };

  const hasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes("Files");

  const dropHandlers = {
    onDragEnter: (event: React.DragEvent) => {
      if (inactive || !hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: React.DragEvent) => {
      if (inactive || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: React.DragEvent) => {
      if (inactive || !hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      if (inactive || !hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      addFiles(Array.from(event.dataTransfer.files));
    },
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      aria-label={labels.input}
      accept={accept}
      multiple={multiple}
      disabled={inactive}
      tabIndex={-1}
      className="sr-only"
      onChange={(event) => {
        addFiles(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = "";
      }}
    />
  );

  const context: FileUploadContextValue = {
    open,
    disabled: inactive,
    labels,
  };

  if (variant === "compact") {
    return (
      <FileUploadContext.Provider value={context}>
        <div
          data-slot="file-upload"
          data-variant="compact"
          data-dragging={dragging || undefined}
          className={cn("relative flex flex-col gap-2", className)}
          {...dropHandlers}
        >
          {input}
          <FileUploadChips
            files={files}
            onRemove={onRemove}
            onRetry={onRetry}
            labels={labels}
            reduced={reduced}
          />
          {children}
          <AnimatePresence>
            {dragging ? (
              <motion.div
                aria-hidden
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduced ? 0 : 0.16, ease: EASE_OUT }}
                className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-ring bg-background/85 backdrop-blur-sm"
              >
                <motion.span
                  initial={reduced ? false : { y: 6, scale: 0.96 }}
                  animate={{ y: 0, scale: 1 }}
                  transition={reduced ? { duration: 0 } : SPRING_PRESS}
                  className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <UploadIcon className="size-4" />
                  {labels.dropOverlay}
                </motion.span>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </FileUploadContext.Provider>
    );
  }

  const description =
    labels.description ??
    (maxSize !== undefined
      ? labels.maxSize(formatFileSize(maxSize))
      : undefined);

  return (
    <FileUploadContext.Provider value={context}>
      <div
        data-slot="file-upload"
        data-variant="default"
        className={cn("flex w-full flex-col gap-3", className)}
      >
        {input}
        <motion.button
          type="button"
          disabled={inactive}
          data-dragging={dragging || undefined}
          onClick={open}
          {...dropHandlers}
          animate={reduced ? undefined : { scale: dragging ? 1.01 : 1 }}
          whileTap={reduced || inactive ? undefined : { scale: 0.99 }}
          transition={SPRING_PRESS}
          className={cn(
            "group relative flex w-full items-center gap-4 rounded-3xl border border-dashed border-border bg-background p-5 text-left outline-none",
            "transition-colors duration-200 hover:border-input hover:bg-muted/40",
            "focus-visible:ring-3 focus-visible:ring-ring/40 data-dragging:border-ring data-dragging:bg-muted/60",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          <motion.span
            aria-hidden
            animate={
              reduced
                ? undefined
                : { y: dragging ? -3 : 0, scale: dragging ? 1.06 : 1 }
            }
            transition={{ duration: 0.2, ease: EASE_OUT }}
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-muted text-foreground transition-colors duration-200 group-data-dragging:bg-primary group-data-dragging:text-primary-foreground"
          >
            <UploadIcon className="size-5" />
          </motion.span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">
              {maxReached ? labels.limitReached : labels.title}
            </span>
            {description && !maxReached ? (
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {description}
              </span>
            ) : null}
          </span>
          <span className="shrink-0 rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-150 group-hover:bg-accent">
            {labels.browse}
          </span>
        </motion.button>

        <ul
          data-slot="file-upload-list"
          className="flex flex-col gap-2 empty:hidden"
        >
          <AnimatePresence initial={false}>
            {files.map((item) => (
              <FileUploadRow
                key={item.id}
                item={item}
                onRemove={onRemove}
                onRetry={onRetry}
                labels={labels}
                reduced={reduced}
              />
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </FileUploadContext.Provider>
  );
}

/* ----------------------------------------------------------------------------
 * A queue row: icon, name, size or error, status, actions, progress.
 * ------------------------------------------------------------------------- */

function StatusGlyph({
  status,
  label,
  reduced,
}: {
  status: FileUploadStatus;
  label: string;
  reduced: boolean;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={status}
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
        transition={{ duration: reduced ? 0 : 0.16, ease: EASE_OUT }}
        className={cn(
          "grid size-7 place-items-center",
          status === "done"
            ? "text-success"
            : status === "error"
              ? "text-destructive"
              : "text-muted-foreground"
        )}
      >
        {status === "done" ? (
          <CheckCircle2Icon aria-hidden className="size-4" />
        ) : status === "error" ? (
          <AlertCircleIcon aria-hidden className="size-4" />
        ) : (
          <Spinner aria-hidden role="presentation" />
        )}
        <span className="sr-only">{label}</span>
      </motion.span>
    </AnimatePresence>
  );
}

function FileUploadRow({
  item,
  onRemove,
  onRetry,
  labels,
  reduced,
}: {
  item: FileUploadItem;
  onRemove?: (item: FileUploadItem) => void;
  onRetry?: (item: FileUploadItem) => void;
  labels: FileUploadLabels;
  reduced: boolean;
}) {
  const name = itemName(item);
  const Icon = iconFor(item);
  const progress =
    item.status === "done"
      ? 100
      : Math.max(0, Math.min(100, item.progress ?? 0));
  const determinate = item.status === "done" || item.progress !== undefined;
  const showProgress = item.status !== "error";

  return (
    <motion.li
      layout={!reduced}
      data-status={item.status}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={
        reduced
          ? { opacity: 0, transition: { duration: 0 } }
          : { opacity: 0, y: -6 }
      }
      transition={
        reduced ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT }
      }
      className={cn(
        "rounded-2xl border bg-card p-3",
        item.status === "error" ? "border-destructive/30" : "border-border"
      )}
    >
      <div className="flex items-center gap-3">
        {item.previewUrl ? (
          <img
            src={item.previewUrl}
            alt=""
            className="size-11 shrink-0 rounded-xl bg-muted object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
          >
            <Icon className="size-5" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{name}</p>
          <p
            className={cn(
              "mt-0.5 truncate text-xs",
              item.status === "error"
                ? "text-destructive"
                : "text-muted-foreground"
            )}
          >
            {formatFileSize(itemSize(item))}
            {item.status === "error" && item.error ? ` · ${item.error}` : null}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <StatusGlyph
            status={item.status}
            label={labels.status[item.status]}
            reduced={reduced}
          />
          {item.status === "error" && onRetry ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={labels.retry(name)}
              onClick={() => onRetry(item)}
            >
              <RotateCcwIcon />
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={labels.remove(name)}
              onClick={() => onRemove(item)}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>
      </div>

      {showProgress ? (
        <div
          role="progressbar"
          aria-label={labels.progress(name)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={determinate ? Math.round(progress) : undefined}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <motion.div
            initial={false}
            animate={{
              scaleX: determinate ? progress / 100 : 0.3,
              opacity: 1,
            }}
            transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
            className={cn(
              "h-full origin-left rounded-full",
              item.status === "done" ? "bg-success" : "bg-primary",
              !determinate && !reduced && "animate-pulse"
            )}
          />
        </div>
      ) : null}
    </motion.li>
  );
}

/* ----------------------------------------------------------------------------
 * Compact chips for the composer.
 * ------------------------------------------------------------------------- */

function FileUploadChips({
  files,
  onRemove,
  onRetry,
  labels,
  reduced,
}: {
  files: FileUploadItem[];
  onRemove?: (item: FileUploadItem) => void;
  onRetry?: (item: FileUploadItem) => void;
  labels: FileUploadLabels;
  reduced: boolean;
}) {
  return (
    <ul
      data-slot="file-upload-chips"
      className="flex flex-wrap gap-1.5 empty:hidden"
    >
      <AnimatePresence initial={false}>
        {files.map((item) => {
          const name = itemName(item);
          const Icon = iconFor(item);
          const error = item.status === "error";
          const progress =
            item.status === "uploading" && item.progress !== undefined
              ? Math.max(0, Math.min(100, item.progress))
              : null;
          return (
            <motion.li
              key={item.id}
              layout={!reduced}
              data-status={item.status}
              title={error && item.error ? item.error : name}
              initial={
                reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 4 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                reduced
                  ? { opacity: 0, transition: { duration: 0 } }
                  : { opacity: 0, scale: 0.9, transition: { duration: 0.14 } }
              }
              transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
              className={cn(
                "relative isolate flex h-8 max-w-56 items-center gap-1.5 overflow-hidden rounded-full border bg-card pr-1 pl-1 text-xs",
                error
                  ? "border-destructive/40 text-destructive"
                  : "border-border text-foreground"
              )}
            >
              {progress !== null ? (
                <motion.span
                  aria-hidden
                  initial={false}
                  animate={{ scaleX: progress / 100, opacity: 1 }}
                  transition={reduced ? { duration: 0 } : SPRING_LAYOUT}
                  className="absolute inset-0 -z-10 origin-left bg-muted"
                />
              ) : null}
              {item.previewUrl ? (
                <img
                  src={item.previewUrl}
                  alt=""
                  className="size-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground"
                >
                  {item.status === "uploading" ? (
                    <Spinner role="presentation" className="size-3.5" />
                  ) : error ? (
                    <AlertCircleIcon className="size-3.5 text-destructive" />
                  ) : (
                    <Icon className="size-3.5" />
                  )}
                </span>
              )}
              <span className="min-w-0 truncate font-medium">{name}</span>
              <span className="sr-only">{labels.status[item.status]}</span>
              {error && onRetry ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={labels.retry(name)}
                  onClick={() => onRetry(item)}
                >
                  <RotateCcwIcon />
                </Button>
              ) : null}
              {onRemove ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={labels.remove(name)}
                  onClick={() => onRemove(item)}
                >
                  <XIcon />
                </Button>
              ) : null}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/* ----------------------------------------------------------------------------
 * FileUploadTrigger: the composer's attach button; opens the picker.
 * ------------------------------------------------------------------------- */

export type FileUploadTriggerProps = Omit<
  React.ComponentProps<typeof Button>,
  "onClick"
>;

export function FileUploadTrigger({
  variant = "ghost",
  size = "icon-sm",
  children,
  disabled,
  ...props
}: FileUploadTriggerProps) {
  const {
    open,
    disabled: inactive,
    labels,
  } = useFileUploadContext("FileUploadTrigger");
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={children ? undefined : labels.attach}
      disabled={disabled || inactive}
      onClick={open}
      {...props}
    >
      {children ?? <PaperclipIcon />}
    </Button>
  );
}
