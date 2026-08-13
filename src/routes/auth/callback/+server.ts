import { redirect, type RequestHandler } from '@sveltejs/kit';
import { exchange } from '$lib/server/oidc';
import { FLOW_COOKIE, callbackUri, flowCookieOptions, unpackFlow } from '$lib/server/oidcFlow';
import { saveTokens } from '$lib/server/oidcStore';
import { createSession, sessionUserFromClaims } from '$lib/server/session';

/** Completes the OIDC flow: session cookie for the app, tokens to the store. */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const flow = unpackFlow(cookies.get(FLOW_COOKIE));
	// One shot per flow: the code is spent either way, so the cookie goes now.
	cookies.delete(FLOW_COOKIE, flowCookieOptions(url));

	if (url.searchParams.get('error')) {
		console.error('oidc: provider refused the authorization', {
			error: url.searchParams.get('error'),
			description: url.searchParams.get('error_description')
		});
		redirect(303, '/login?error=interrupted');
	}

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	// A missing cookie means the flow expired or never started here; a state
	// mismatch means this callback belongs to some other flow. Both restart.
	if (!flow || !code || !state || state !== flow.state) redirect(303, '/login?error=interrupted');

	const tokens = await exchange(code, flow.verifier, callbackUri(url)).catch((err) => {
		console.error('oidc: code exchange failed', err);
		return null;
	});
	if (!tokens) redirect(303, '/login?error=unavailable');

	const user = sessionUserFromClaims(tokens.claims);

	// The refresh token is what lets warehouse queries mint a fresh id_token
	// long after this login; without it StarRocks access dies in ~5 minutes.
	if (!tokens.refreshToken) {
		console.warn(
			`oidc: no refresh_token for ${user.username} — check the offline_access scope is bound to the provider`
		);
	}
	await saveTokens(user.username, tokens).catch((err) =>
		console.error('oidc: could not persist tokens', err)
	);

	await createSession(cookies, url, user);
	redirect(303, flow.redirectTo);
};
