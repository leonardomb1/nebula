import { error, json, type RequestHandler } from '@sveltejs/kit';
import { listFiles, readFileSql, safeName, writeFileSql } from '$lib/server/queryFiles';

/** The signed-in user's saved queries: GET lists them, POST creates one. */
export const GET: RequestHandler = async ({ locals }) => {
	return json({ files: await listFiles(locals.user!.username) });
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as { name?: string; sql?: string } | null;
	const name = safeName(body?.name);
	if (!name) error(400, 'invalid name');

	const username = locals.user!.username;
	// Creating never clobbers an existing file — the caller picks a free name.
	if ((await readFileSql(username, name)) !== null) error(409, 'a query with that name exists');

	await writeFileSql(username, name, body?.sql ?? '');
	return json({ name }, { status: 201 });
};
