/**
 * Rows for the files users put into conversations; the bytes live behind
 * `@intelligo-dev/core/storage`.
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

export { sweepAttachments, type AttachmentSweepResult } from "./sweep";

export {
  AttachmentServiceError,
  isAttachmentServiceError,
  type AttachmentServiceErrorCode,
} from "./errors";

export type { Attachment, AttachmentActor, InsertAttachment } from "./types";
