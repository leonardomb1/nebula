import { error, json, type RequestHandler } from '@sveltejs/kit';
import { startRun } from '$lib/server/queryRuns';

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as {
		sql?: string;
		database?: string;
		profile?: boolean;
	} | null;

	const sql = body?.sql?.trim();
	if (!sql) error(400, 'sql is required');

	const run = startRun(
		locals.user!.username,
		sql,
		body?.database?.trim() || null,
		body?.profile === true
	);
	return json({ runId: run.id }, { status: 202 });
};
