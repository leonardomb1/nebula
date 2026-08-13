import { redirect, type RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { endSessionUrl } from '$lib/server/oidc';
import { forgetTokens, storedIdToken } from '$lib/server/oidcStore';
import { clearSession } from '$lib/server/session';

/**
 * Ends the app session and (best effort) the IdP session. The id_token hint is
 * read BEFORE the store is wiped — without it authentik won't redirect back.
 */
export const GET: RequestHandler = async ({ url, locals, cookies }) => {
	const user = locals.user;
	clearSession(cookies, url);

	let idpLogout: string | null = null;
	if (user) {
		const hint = await storedIdToken(user.username);
		await forgetTokens(user.username);
		const postLogout = new URL('/login?signedout', env.ORIGIN || url.origin).toString();
		idpLogout = await endSessionUrl(postLogout, hint ?? undefined).catch(() => null);
	}

	redirect(303, idpLogout ?? '/login?signedout');
};
