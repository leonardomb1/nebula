import { redirect, type RequestHandler } from '@sveltejs/kit';
import { authorizeUrl } from '$lib/server/oidc';
import {
	FLOW_COOKIE,
	callbackUri,
	flowCookieOptions,
	packFlow,
	safeRedirect
} from '$lib/server/oidcFlow';

/** Starts the OIDC dance: park state + PKCE verifier in a cookie, go to the IdP. */
export const GET: RequestHandler = async ({ url, cookies }) => {
	const start = await authorizeUrl(callbackUri(url), {
		forceLogin: url.searchParams.has('force')
	});

	cookies.set(
		FLOW_COOKIE,
		packFlow({
			state: start.state,
			verifier: start.verifier,
			redirectTo: safeRedirect(url.searchParams.get('redirectTo'))
		}),
		flowCookieOptions(url)
	);

	redirect(303, start.url);
};
