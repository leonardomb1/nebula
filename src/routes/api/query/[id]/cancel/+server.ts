import { error, json, type RequestHandler } from '@sveltejs/kit';
import { cancelRun, getRun } from '$lib/server/queryRuns';

export const POST: RequestHandler = async ({ params, locals }) => {
	const run = getRun(params.id!);
	if (!run || run.username !== locals.user!.username) error(404, 'unknown run');

	await cancelRun(run);
	return json({ status: run.status });
};
