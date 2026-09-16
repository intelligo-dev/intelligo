export type AttachmentServiceErrorCode =
  "not_found" | "forbidden" | "invalid_input" | "database_error";

export class AttachmentServiceError extends Error {
  constructor(
    public readonly code: AttachmentServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AttachmentServiceError";
  }
}

export function isAttachmentServiceError(
  error: unknown
): error is AttachmentServiceError {
  return error instanceof AttachmentServiceError;
}
