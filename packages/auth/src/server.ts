/**
 * Better-Auth Server Configuration
 *
 * Configures authentication with:
 * - Email + password authentication
 * - OAuth providers (Google, GitHub) with graceful env var fallback
 * - Drizzle database adapter
 * - Session persistence (7-day expiration, 1-day update age)
 * - Organization plugin for multi-tenant workspace support (Phase 10)
 * - Email sending via Resend for verification, password reset, welcome (Phase 14)
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, organization } from "better-auth/plugins";
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  userAc,
} from "better-auth/plugins/admin/access";
import { PLATFORM_ADMIN_ROLE } from "./roles";

/**
 * Access control for the platform role.
 *
 * Better-Auth refuses an `adminRoles` entry that no role definition
 * backs — "Invalid admin roles" at build time — which is the right
 * behaviour: it stops a typo from silently granting nothing, or a
 * renamed role from silently granting everything. `platform-admin`
 * takes the plugin's own admin statements unchanged; the product
 * defines no extra platform permissions yet.
 */
const accessControl = createAccessControl(defaultStatements);
const platformAdminRole = accessControl.newRole(adminAc.statements);
const userRole = accessControl.newRole(userAc.statements);
import { db } from "@intelligo/core/db";
import {
  users,
  sessions,
  accounts,
  verifications,
  organization as organizationTable,
  member,
  invitation,
} from "@intelligo/core/db/schema";
import {
  sendVerifyEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendInvitationEmail,
} from "@intelligo/core/email";
import { eq } from "drizzle-orm";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Map our schema tables to Better-Auth's expected names
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      // Organization plugin tables (Phase 10)
      organization: organizationTable,
      member: member,
      invitation: invitation,
    },
  }),

  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000",

  emailAndPassword: {
    enabled: true,
    // Only enforce email verification when a real email provider is configured
    // or in production — otherwise dev users (no RESEND_API_KEY) cannot log in.
    requireEmailVerification:
      process.env.NODE_ENV === "production" || !!process.env.RESEND_API_KEY,
    // Password reset email hook (EMAIL-05)
    sendResetPassword: async ({ user, url }) => {
      sendPasswordResetEmail({
        to: user.email,
        userName: user.name || user.email,
        resetUrl: url,
      }).catch((err) =>
        console.error("[Auth] Failed to send password reset email:", err)
      );
    },
  },

  // Email verification hook (EMAIL-04)
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      sendVerifyEmail({
        to: user.email,
        userName: user.name || user.email,
        verificationUrl: url,
      }).catch((err) =>
        console.error("[Auth] Failed to send verification email:", err)
      );
    },
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },

  socialProviders: {
    // Google OAuth - only enabled when env vars are configured
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),

    // GitHub OAuth - only enabled when env vars are configured
    ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID,
            clientSecret: process.env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
  },

  session: {
    // Sessions expire after 7 days
    expiresIn: 60 * 60 * 24 * 7,
    // Session token updated every 24 hours (extends expiration on active usage)
    updateAge: 60 * 60 * 24,
  },

  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000"],

  // Database hooks for automatic workspace setup (WORK-01)
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-create personal workspace for new users
          try {
            const slug = ((user.email || "user").split("@")[0] || "user")
              .toLowerCase()
              .replace(/[^a-z0-9-]/g, "-")
              .slice(0, 30);

            await auth.api.createOrganization({
              headers: new Headers(),
              body: {
                name: `${user.name || "User"}'s Workspace`,
                slug: `${slug}-${Date.now().toString(36)}`,
                userId: user.id, // Associate with the user
              },
            });
          } catch (error) {
            // TR-0024: handle race — if hook fires twice for same signup (two
            // concurrent requests), the unique slug constraint catches the dup.
            // Check if an org was created despite the error.
            if (
              error instanceof Error &&
              (error.message?.includes("duplicate") ||
                error.message?.includes("unique") ||
                error.message?.includes("slug"))
            ) {
              const orgs = await auth.api.listOrganizations({
                headers: new Headers(),
              });
              if (orgs && orgs.length > 0) {
                // Org already created by the other hook — not an error.
                return;
              }
            }
            // Log for ops visibility; do not throw (user registration succeeded)
            console.error(
              "[user.create hook] Failed to create workspace:",
              error
            );
          }

          // Send welcome email (EMAIL-03, fire-and-forget).
          // NOTE(DB-12): No retry or outbox — downstream failures silently ignored.
          // Acceptable for v0.2; consider transactional outbox for Phase 14.
          const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000"}/dashboard`;
          sendWelcomeEmail({
            to: user.email,
            userName: user.name || user.email,
            dashboardUrl,
          }).catch((err) =>
            console.error("[Auth] Failed to send welcome email:", err)
          );
        },
      },
    },
    session: {
      create: {
        before: async (session): Promise<{ data: typeof session }> => {
          // Check if user is soft-deleted before creating session
          try {
            const userRecord = await db
              .select({ deletedAt: users.deletedAt })
              .from(users)
              .where(eq(users.id, session.userId))
              .limit(1);

            if (userRecord[0]?.deletedAt) {
              throw new Error(
                "This account has been deleted. Contact support@intelligo.dev to recover your account within 30 days."
              );
            }
          } catch (error) {
            console.error(
              "[session.create hook] Deleted user check failed:",
              error
            );
            throw error; // Re-throw to prevent session creation
          }

          // Auto-set active organization on session creation
          // NOTE(DB-11): Uses new Headers() — bypasses any future middleware
          // (bot detection, request signing). Acceptable for v0.2; pass request
          // headers through hook context if middleware layering is needed later.
          try {
            const orgs: any = await auth.api.listOrganizations({
              headers: new Headers(),
              query: { userId: session.userId },
            });

            if (orgs && orgs.length > 0) {
              // Auto-set active org on session creation
              return {
                data: {
                  ...session,
                  activeOrganizationId: orgs[0].id,
                },
              };
            }
          } catch (error) {
            console.error(
              "[session.create hook] Failed to set active org:",
              error
            );
          }

          return { data: session };
        },
      },
    },
  },

  plugins: [
    organization({
      // Allow all users to create organizations (will be plan-gated in Phase 15)
      allowUserToCreateOrganization: async () => true,
      // Generous default limit (will be plan-gated later)
      organizationLimit: 5,
      // Creator becomes owner (explicit for clarity)
      creatorRole: "owner",
      // Invitation email sending via Resend (EMAIL-06, replaces Phase 10 placeholder)
      sendInvitationEmail: async (data) => {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000";
        sendInvitationEmail({
          to: data.email,
          inviterName: data.inviter?.user?.name || "A team member",
          workspaceName: data.organization?.name || "a workspace",
          role: data.role || "member",
          acceptUrl: `${appUrl}/accept-invitation/${data.id}`,
          declineUrl: `${appUrl}/invitation/decline?id=${data.id}`,
        }).catch((err) =>
          console.error("[Auth] Failed to send invitation email:", err)
        );
      },
      // Invitations expire after 7 days (matches TEAM-10)
      invitationExpiresIn: 60 * 60 * 24 * 7,
    }),
    /**
     * Platform administration — enabled only for its impersonation
     * endpoints, which the operational console uses for support.
     *
     * `adminRoles` is deliberately a platform role and not a workspace
     * one: workspace `owner` is per-tenant and every self-serve signup
     * owns their own workspace, so gating anything cross-tenant on it
     * grants it to everybody. `users.role` carries the platform role;
     * requirePlatformAdmin promotes from PLATFORM_ADMIN_EMAILS into it.
     *
     * An impersonation session is capped at 30 minutes. Support work
     * is measured in minutes, and a session inherited by whoever next
     * uses that browser is the failure mode worth designing against.
     *
     * `allowImpersonatingAdmins` stays false: one platform admin
     * cannot take over another's account, which is what keeps the
     * audit trail meaningful.
     */
    admin({
      ac: accessControl,
      roles: { user: userRole, [PLATFORM_ADMIN_ROLE]: platformAdminRole },
      defaultRole: "user",
      adminRoles: [PLATFORM_ADMIN_ROLE],
      impersonationSessionDuration: 30 * 60,
      allowImpersonatingAdmins: false,
    }),
  ],
});
