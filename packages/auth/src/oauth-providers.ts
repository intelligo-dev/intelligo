/**
 * OAuth 2.0 and OpenID Connect providers beyond Google and GitHub,
 * through Better-Auth's `genericOAuth` plugin.
 *
 * Which providers exist and where their endpoints are is configuration,
 * read from `OAUTH_PROVIDERS` and `OAUTH_<ID>_*` (`readOAuthProviders` in
 * `@intelligo-dev/core/env`), so the auth instance can still be built at
 * module load. How a provider's profile becomes a user is code: the
 * composition root registers it with `registerOAuthProfileMapper`, and
 * it is looked up on each sign-in, so registering after this module
 * loaded is in time.
 *
 * A provider whose profile carries no email for some accounts needs a
 * mapper: Better-Auth refuses a user without one. Give such a user an
 * address on a domain you control that nobody receives mail at, and
 * leave `emailVerified` false.
 */

import { readOAuthProviders } from "@intelligo-dev/core/env";
import type {
  GenericOAuthConfig,
  GenericOAuthUserInfo,
} from "better-auth/plugins";

/** The raw profile a provider's user-info endpoint (or ID token) returned. */
export type OAuthProfile = GenericOAuthUserInfo;

/** The user fields a mapper sets, over the ones read from the profile. */
export type OAuthMappedUser = Awaited<
  ReturnType<NonNullable<GenericOAuthConfig["mapProfileToUser"]>>
>;

export type OAuthProfileMapper = (
  profile: OAuthProfile
) => OAuthMappedUser | Promise<OAuthMappedUser>;

const mappers = new Map<string, OAuthProfileMapper>();

/**
 * Maps a provider's profile to the user it signs in. Without one, the
 * profile's own `email`, `name`, `image` and `emailVerified` are used.
 * Call from the composition root; a second call for the same provider
 * replaces the first.
 */
export function registerOAuthProfileMapper(
  providerId: string,
  mapper: OAuthProfileMapper
): void {
  mappers.set(providerId, mapper);
}

/**
 * Reads the account's subject from one profile field. A missing or empty
 * value comes back empty, which Better-Auth refuses (OAUTH_ACCOUNT_SUBJECT_INVALID)
 * rather than signing in an account with no identity.
 */
function subjectFrom(
  field: string
): NonNullable<GenericOAuthConfig["accountSubject"]> {
  return ({ profile }) => {
    const value = (profile as Record<string, unknown>)[field];
    return typeof value === "string" || typeof value === "number" ? value : "";
  };
}

/** Better-Auth configs for the declared providers; empty when none are. */
export function oauthProviderConfigs(
  env: Record<string, string | undefined> = process.env
): GenericOAuthConfig[] {
  return readOAuthProviders(env).providers.map((p) => ({
    providerId: p.id,
    clientId: p.clientId,
    ...(p.clientSecret ? { clientSecret: p.clientSecret } : {}),
    ...(p.discoveryUrl ? { discoveryUrl: p.discoveryUrl } : {}),
    ...(p.authorizationUrl ? { authorizationUrl: p.authorizationUrl } : {}),
    ...(p.tokenUrl ? { tokenUrl: p.tokenUrl } : {}),
    ...(p.userInfoUrl ? { userInfoUrl: p.userInfoUrl } : {}),
    ...(p.scopes ? { scopes: p.scopes } : {}),
    pkce: p.pkce,
    ...(p.subjectField ? { accountSubject: subjectFrom(p.subjectField) } : {}),
    mapProfileToUser: async (profile) =>
      (await mappers.get(p.id)?.(profile)) ?? {},
  }));
}

/** The declared providers a sign-in page offers, as `{ id, name }`. */
export function listOAuthProviders(
  env: Record<string, string | undefined> = process.env
): { id: string; name: string }[] {
  return readOAuthProviders(env).providers.map(({ id, name }) => ({
    id,
    name,
  }));
}
