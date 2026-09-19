/**
 * Server-side auth. Client components use `@intelligo-dev/auth/client`.
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
export {
  AuthGuardError,
  isAuthGuardError,
  type AuthGuardErrorCode,
} from "./guard-error";
export { ensureUserWorkspace } from "./workspace-init";
export type { WorkspaceRole } from "./helpers";
export { PLATFORM_ADMIN_ROLE } from "./roles";
export {
  impersonateUser,
  stopImpersonating,
  type ImpersonatedSession,
} from "./impersonation";

export type { Session, User } from "better-auth/types";

export {
  orgApi,
  type OrgApi,
  type OrgEndpointOptions,
  type OrgRole,
  type OrgListItem,
  type OrgInvitation,
  type OrgMember,
} from "./org-api";

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
