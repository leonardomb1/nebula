import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	// The hook guarantees a session on non-public routes.
	return { user: locals.user! };
};
