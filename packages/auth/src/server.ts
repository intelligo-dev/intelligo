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
import { resolveTrustedOrigins } from "./trusted-origins";

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
import { db } from "@intelligo-dev/core/db";
import {
  users,
  sessions,
  accounts,
  verifications,
  organization as organizationTable,
  member,
  invitation,
} from "@intelligo-dev/core/db/schema";
import {
  ConsoleProvider,
  getEmailProvider,
  sendVerifyEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendInvitationEmail,
} from "@intelligo-dev/core/email";
import { eq } from "drizzle-orm";
import { personalWorkspaceSlug } from "./workspace-slug";

/**
 * The origin this app is served from.
 *
 * `NEXT_PUBLIC_APP_URL` is a REQUIRED variable (`assertEnv` in
 * `@intelligo-dev/core/env`), but auth is configured at module load,
 * long before any composition root asserts it. This value therefore
 * still needs a fallback for the absolute links that go into email —
 * a verification or invitation URL has to name a concrete host.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";

/**
 * Origins the CSRF check accepts — the one place the fallback above
 * must NOT apply, because a guessed port there does not degrade
 * gracefully. See `resolveTrustedOrigins` for the rule.
 */
const TRUSTED_ORIGINS = resolveTrustedOrigins(process.env);

export const auth = betterAuth({
  // Explicit, so the name the framework documents (doctor, scaffold,
  // env validation) is the one that is honoured; AUTH_SECRET stays a
  // legacy alias.
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
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

  baseURL: APP_URL,

  emailAndPassword: {
    enabled: true,
    // Verification is required exactly when a verification email can be
    // sent. Without a provider the link only reaches the server console,
    // so requiring it would lock every new account out — in production
    // as much as in development. `validateEnv` warns about that case.
    requireEmailVerification: !(getEmailProvider() instanceof ConsoleProvider),
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

  trustedOrigins: TRUSTED_ORIGINS,

  // Database hooks for automatic workspace setup (WORK-01)
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-create personal workspace for new users
          try {
            await auth.api.createOrganization({
              // Deliberately no `headers`. The organization plugin reads a
              // session from the context and refuses the call when headers
              // are present but carry none — `if (!session && (ctx.request
              // || ctx.headers)) throw UNAUTHORIZED`. An empty
              // `new Headers()` counts as present, so this hook threw
              // UNAUTHORIZED on every signup and no workspace was ever
              // created here; the layout fallback was silently doing all
              // the work. Omitting headers takes the system path that
              // `body.userId` exists to enable.
              body: {
                name: `${user.name || "User"}'s Workspace`,
                slug: personalWorkspaceSlug(user.email, user.id),
                userId: user.id, // Associate with the user
              },
            });
          } catch (error) {
            // The slug is derived from the user, so a racing provisioner
            // loses on `organization.slug`'s unique index: the workspace
            // exists, which is the outcome this hook wanted. Anything else
            // is worth ops visibility, but never fails the registration.
            const message =
              error instanceof Error ? error.message : String(error);
            if (!/already exists|duplicate|unique|slug/i.test(message)) {
              console.error(
                "[user.create hook] Failed to create workspace:",
                error
              );
            }
          }

          // Send welcome email (EMAIL-03, fire-and-forget).
          // NOTE(DB-12): No retry or outbox — downstream failures silently ignored.
          // Acceptable for v0.2; consider transactional outbox for Phase 14.
          const dashboardUrl = `${APP_URL}/dashboard`;
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

          // Auto-set active organization on session creation.
          //
          // Read `member` directly rather than calling
          // `/organization/list`: that endpoint is `requireHeaders` and
          // resolves the user from the session it is handed, and it takes
          // no `userId` query. Called with `new Headers()` it threw
          // UNAUTHORIZED on every sign-in — including the one
          // `autoSignInAfterVerification` performs — so the pointer was
          // never set and the first authenticated render had to discover a
          // workspace for itself. There is no session to pass here by
          // definition: this hook runs while one is being created.
          try {
            const [membership] = await db
              .select({ organizationId: member.organizationId })
              .from(member)
              .where(eq(member.userId, session.userId))
              .orderBy(member.createdAt)
              .limit(1);

            if (membership) {
              return {
                data: {
                  ...session,
                  activeOrganizationId: membership.organizationId,
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
        sendInvitationEmail({
          to: data.email,
          inviterName: data.inviter?.user?.name || "A team member",
          workspaceName: data.organization?.name || "a workspace",
          role: data.role || "member",
          acceptUrl: `${APP_URL}/accept-invitation/${data.id}`,
          declineUrl: `${APP_URL}/invitation/decline?id=${data.id}`,
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
