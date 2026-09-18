/**
 * The Better-Auth instance: email + password, optional Google/GitHub OAuth,
 * organizations as workspaces, and the admin plugin for impersonation.
 * Configured at module load; reaches the database and email provider.
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
 * Access control for the platform role. Better-Auth refuses an `adminRoles`
 * entry no role definition backs ("Invalid admin roles"); `platform-admin`
 * takes the plugin's own admin statements unchanged.
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
 * The origin this app is served from. `NEXT_PUBLIC_APP_URL` is required, but
 * auth is configured at module load, before any composition root asserts it,
 * and the absolute links in email still need a concrete host.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:4000";

/**
 * Origins the CSRF check accepts. The fallback above must NOT apply here:
 * a guessed port rejects every sign-in. See `resolveTrustedOrigins`.
 */
const TRUSTED_ORIGINS = resolveTrustedOrigins(process.env);

export const auth = betterAuth({
  // Explicit, so the documented name is the one honoured; AUTH_SECRET is
  // accepted as an alias.
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
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
    // Each OAuth provider is enabled only when its env vars are set.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),

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
    expiresIn: 60 * 60 * 24 * 7,
    // Refreshed at most daily, extending the expiry while in use.
    updateAge: 60 * 60 * 24,
  },

  trustedOrigins: TRUSTED_ORIGINS,

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Provision the personal workspace.
          try {
            await auth.api.createOrganization({
              // Deliberately no `headers`: the organization plugin throws
              // UNAUTHORIZED when headers are present but carry no session,
              // and an empty `new Headers()` counts as present. Omitting
              // them takes the system path `body.userId` exists for.
              body: {
                name: `${user.name || "User"}'s Workspace`,
                slug: personalWorkspaceSlug(user.email, user.id),
                userId: user.id,
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

          // Fire-and-forget: no retry or outbox, a failure is only logged.
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
          // A soft-deleted user gets no session.
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
            throw error;
          }

          // Set the active organization. Reads `member` directly because
          // `/organization/list` resolves the user from a session, and this
          // hook runs while that session is being created.
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
      allowUserToCreateOrganization: async () => true,
      organizationLimit: 5,
      creatorRole: "owner",
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
      invitationExpiresIn: 60 * 60 * 24 * 7,
    }),
    /**
     * Enabled for its impersonation endpoints, used by the console.
     * `adminRoles` is a platform role, never a workspace one: every
     * self-serve signup owns a workspace. `users.role` carries it;
     * requirePlatformAdmin promotes from PLATFORM_ADMIN_EMAILS into it.
     * Sessions are capped at 30 minutes, and one admin cannot impersonate
     * another, which keeps the audit trail meaningful.
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
