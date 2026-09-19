import type { db } from "@intelligo-dev/core/db";

/**
 * What a billing read runs on: `db`, or the transaction whose lock and
 * snapshot the read has to share.
 */
export type BillingReader = Pick<typeof db, "select">;
