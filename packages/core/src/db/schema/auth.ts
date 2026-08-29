/**
 * Better-Auth Database Schema
 *
 * These tables are managed by Better-Auth. Column names and structure must
 * match Better-Auth's expectations for the Drizzle adapter to work correctly.
 *
 * DO NOT modify table or column names without consulting Better-Auth docs.
 */

import {
  pgTable,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Users table - Core user identity
 * Managed by Better-Auth
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  deletedAt: timestamp("deleted_at"), // Soft delete: null = active, timestamp = deleted
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Onboarding state (Phase 29, v0.5)
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  onboardingStep: text("onboarding_step"), // Current step if incomplete: "workspace" | "language" | "product"
  // Language preference (Phase 29, v0.5)
  preferredLanguage: text("preferred_language").notNull().default("en"), // "en" | "mn"
  /**
   * Platform role, NOT a workspace role — "platform-admin" or null.
   * Workspace membership roles live on `member.role`; this one grants
   * the operational console and is what Better-Auth's admin plugin
   * checks before allowing impersonation.
   *
   * PLATFORM_ADMIN_EMAILS remains the bootstrap: requirePlatformAdmin
   * promotes an allowlisted user into this column on first use, so the
   * env var seeds the first admin and the row is the runtime truth.
   */
  role: text("role"),
  /** Better-Auth admin plugin. Unused by the product; the plugin's schema expects them. */
  banned: boolean("banned").notNull().default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
});

/**
 * Sessions table - Active login sessions
 * Managed by Better-Auth
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /**
     * Set on a session created by an admin acting as this user. Its
     * presence is what makes impersonation visible after the fact —
     * both in the audit trail and on the session itself.
     */
    impersonatedBy: text("impersonated_by"),
    /**
     * Better-Auth's organization plugin stores the session's active
     * organization here. Without this column the plugin's set-active
     * writes are silently dropped, so workspace switching never
     * persists and every "active workspace" read falls back to the
     * user's first membership.
     */
    activeOrganizationId: text("active_organization_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)]
);

/**
 * Accounts table - OAuth provider connections + password storage
 * Managed by Better-Auth
 */
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("accounts_user_id_idx").on(table.userId)]
);

/**
 * Verifications table - Email verification tokens and password reset tokens
 * Managed by Better-Auth
 */
export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Organization table - Workspaces for multi-tenancy
 * Managed by Better-Auth organization plugin (Phase 10)
 */
export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Member table - Organization/Workspace memberships
 * Managed by Better-Auth organization plugin (Phase 10)
 */
export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("member_organization_id_idx").on(table.organizationId),
    index("member_user_id_idx").on(table.userId),
    uniqueIndex("member_organization_user_uniq").on(
      table.organizationId,
      table.userId
    ),
  ]
);

/**
 * Invitation table - Pending workspace invitations
 * Managed by Better-Auth organization plugin (Phase 10)
 */
export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    inviterId: text("inviter_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("invitation_organization_id_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ]
);

// Export inferred types for TypeScript usage
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type InsertAccount = typeof accounts.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type InsertVerification = typeof verifications.$inferInsert;
export type Organization = typeof organization.$inferSelect;
export type InsertOrganization = typeof organization.$inferInsert;
export type Member = typeof member.$inferSelect;
export type InsertMember = typeof member.$inferInsert;
export type Invitation = typeof invitation.$inferSelect;
export type InsertInvitation = typeof invitation.$inferInsert;
