/**
 * Better-Auth Server Exports
 *
 * Server-side authentication utilities.
 * For client-side auth, use @intelligo/auth/client
 */

export { auth } from "./server";
export {
  getAuthSession,
  requireAuth,
  getWorkspaceContext,
  getWorkspaceContextById,
  requireWorkspace,
  requireRole,
  requirePlatformAdmin,
} from "./helpers";
export { ensureUserWorkspace } from "./workspace-init";
export type { WorkspaceRole } from "./helpers";
export { PLATFORM_ADMIN_ROLE } from "./roles";
export {
  impersonateUser,
  stopImpersonating,
  type ImpersonatedSession,
} from "./impersonation";

// Re-export common types from Better-Auth
export type { Session, User } from "better-auth/types";

// Typed Better-Auth organization plugin wrapper
export {
  orgApi,
  type OrgApi,
  type OrgEndpointOptions,
  type OrgRole,
  type OrgListItem,
  type OrgInvitation,
  type OrgMember,
} from "./org-api";

// Team management service (page/registry migration, section C1)
export {
  createTeamService,
  type TeamService,
  type TeamServicePorts,
} from "./team/service";
export {
  TeamServiceError,
  isTeamServiceError,
  type TeamServiceErrorCode,
  type TeamServiceErrorMeta,
} from "./team/errors";
export {
  inviteMemberSchema,
  updateRoleSchema,
  type InviteMemberInput,
  type UpdateRoleInput,
} from "./team/schemas";

// Workspace management service (page/registry migration, workspace-settings family)
export {
  createWorkspaceService,
  type WorkspaceService,
  type WorkspaceServicePorts,
  type WorkspaceRecord,
} from "./workspace/service";
export {
  WorkspaceServiceError,
  isWorkspaceServiceError,
  type WorkspaceServiceErrorCode,
  type WorkspaceServiceErrorMeta,
} from "./workspace/errors";
export {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  type CreateWorkspaceInput,
  type UpdateWorkspaceInput,
} from "./workspace/schemas";

// Profile management service (page/registry migration, profile-settings family)
export {
  createProfileService,
  type ProfileService,
  type ProfileServicePorts,
  type ProfileRecord,
} from "./profile/service";
export {
  ProfileServiceError,
  isProfileServiceError,
  type ProfileServiceErrorCode,
  type ProfileServiceErrorMeta,
} from "./profile/errors";
export {
  updateProfileSchema,
  type UpdateProfileInput,
} from "./profile/schemas";

// Onboarding service (page/registry migration, `onboarding` family)
export {
  createOnboardingService,
  type OnboardingService,
  type OnboardingState,
} from "./onboarding/service";
export {
  OnboardingServiceError,
  isOnboardingServiceError,
  type OnboardingServiceErrorCode,
} from "./onboarding/errors";
export { setStepSchema, type SetStepInput } from "./onboarding/schemas";
