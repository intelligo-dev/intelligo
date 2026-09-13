/**
 * Attachments Module
 *
 * Rows for the files users put into conversations; the bytes live
 * behind `@intelligo-dev/core/storage`.
 *
 * Use via subpath import: @intelligo-dev/core/attachments
 */

export {
  attachToConversation,
  createAttachment,
  deleteAttachment,
  getAttachment,
  getAttachments,
  listOrphanAttachments,
  setExtractedText,
} from "./service";

export {
  AttachmentServiceError,
  isAttachmentServiceError,
  type AttachmentServiceErrorCode,
} from "./errors";

export type { Attachment, AttachmentActor, InsertAttachment } from "./types";
