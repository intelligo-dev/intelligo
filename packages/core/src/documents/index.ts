/**
 * Documents Module (ADR-0009)
 *
 * Document lifecycle: save, list, read, delete versions, plus
 * ownership and workspace/user access checks. See ./service.ts for
 * the full module doc comment.
 *
 * Use via subpath import: @intelligo/core/documents
 */

export {
  getUserDocuments,
  getDocument,
  saveDocument,
  deleteDocumentVersions,
} from "./service";

export {
  DocumentServiceError,
  isDocumentServiceError,
  type DocumentServiceErrorCode,
} from "./errors";

export type { DocumentActor, DocumentFilter, DocumentListItem } from "./types";

export {
  registerDocumentPatterns,
  classifyDocumentTitle,
  isProductDocument,
  listRegisteredDocumentPatterns,
  clearDocumentPatternRegistry,
  type DocumentPatternEntry,
} from "./classifier";
