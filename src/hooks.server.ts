import { json, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getTextDirection } from '$lib/paraglide/runtime';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { readSession } from '$lib/server/session';

/** Paths reachable without a session. */
function isPublic(pathname: string): boolean {
	return (
		pathname === '/login' || pathname === '/healthz' || pathname.startsWith('/auth/')
	);
}

const handleAuth: Handle = async ({ event, resolve }) => {
	event.locals.user = await readSession(event.cookies);

	if (!event.locals.user && !isPublic(event.url.pathname)) {
		// API callers get a machine-readable 401; navigations go to sign-in and
		// come back to where they were headed.
		if (event.url.pathname.startsWith('/api/')) {
			return json({ error: 'unauthenticated' }, { status: 401 });
		}
		const redirectTo = encodeURIComponent(event.url.pathname + event.url.search);
		redirect(303, `/login?redirectTo=${redirectTo}`);
	}

	return resolve(event);
};

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;
		return resolve(event, {
			transformPageChunk: ({ html }) =>
				html.replace('%paraglide.lang%', locale).replace('%paraglide.dir%', getTextDirection(locale))
		});
	});

export const handle: Handle = sequence(handleAuth, handleParaglide);
