/**
 * The links an invitation email carries. Both land on the invitation page,
 * which offers accept and decline to the signed-in invitee; declining is a
 * decision made there, never the effect of following a link.
 *
 * Unprefixed on purpose: the consumer's locale middleware resolves the
 * invitee's locale, so the email does not have to guess one.
 */
export function invitationLinks(
  appUrl: string,
  invitationId: string
): { acceptUrl: string; declineUrl: string } {
  const page = `${appUrl.replace(/\/+$/, "")}/accept-invitation/${encodeURIComponent(invitationId)}`;
  return { acceptUrl: page, declineUrl: page };
}
