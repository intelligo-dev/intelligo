export {
  getUserDocuments,
  getDocument,
  getDocumentVersions,
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
