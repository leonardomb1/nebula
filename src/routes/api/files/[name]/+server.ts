import { error, json, type RequestHandler } from '@sveltejs/kit';
import {
	readFileSql,
	removeFile,
	renameFileSql,
	safeName,
	writeFileSql
} from '$lib/server/queryFiles';

/** One saved query: read it, write/rename it, delete it. */

function nameOf(raw: string | undefined): string {
	const name = safeName(raw);
	if (!name) error(400, 'invalid name');
	return name;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const sql = await readFileSql(locals.user!.username, nameOf(params.name));
	if (sql === null) error(404, 'unknown query');
	return json({ name: nameOf(params.name), sql });
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const username = locals.user!.username;
	let name = nameOf(params.name);
	const body = (await request.json().catch(() => null)) as {
		sql?: string;
		renameTo?: string;
	} | null;

	if (body?.renameTo !== undefined) {
		const target = nameOf(body.renameTo);
		if (!(await renameFileSql(username, name, target))) {
			error(409, 'a query with that name exists');
		}
		name = target;
	}
	if (body?.sql !== undefined) await writeFileSql(username, name, body.sql);

	return json({ name });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await removeFile(locals.user!.username, nameOf(params.name));
	return json({ deleted: true });
};
