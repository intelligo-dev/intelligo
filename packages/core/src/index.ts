// There was an `export const version = "0.0.0"` here, on a package
// published as 1.0.0-beta.3, read by nothing. A version constant that
// has to be kept in step with the manifest by hand will not be; the
// manifest is the one place that cannot drift, and consumers who need
// it can read it from there.

// Re-export database client
export * from "./db";

// Email module -- use subpath import: @intelligo-dev/core/email
// Notifications module -- use subpath import: @intelligo-dev/core/notifications
// Conversations module -- use subpath import: @intelligo-dev/core/conversations
// Documents module -- use subpath import: @intelligo-dev/core/documents
// Identity module -- use subpath import: @intelligo-dev/core/identity
// Logger -- use subpath import: @intelligo-dev/core/logger
// Env -- use subpath import: @intelligo-dev/core/env
