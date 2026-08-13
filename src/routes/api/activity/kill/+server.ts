import { error, json, type RequestHandler } from '@sveltejs/kit';
import { connectAsUser, warehouseCredentials, WarehouseAuthRequired } from '$lib/server/db';

const QUERY_ID_RE = /^[0-9a-fA-F-]{16,64}$/;

/**
 * Kills a query from the monitor. StarRocks itself doesn't privilege-check
 * KILL, so the app gates it: the target must be visible in the caller's own
 * PROCESSLIST and belong to the same warehouse user the caller connects as.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as { queryId?: string } | null;
	const queryId = body?.queryId?.trim();
	if (!queryId || !QUERY_ID_RE.test(queryId)) error(400, 'invalid queryId');

	const credentials = warehouseCredentials(locals.user!.username);
	let conn;
	try {
		conn = await connectAsUser(credentials);
	} catch (err) {
		if (err instanceof WarehouseAuthRequired) error(401, 'warehouse sign-in required');
		throw err;
	}

	try {
		// PROCESSLIST lacks QueryId on some 3.5 builds — '/current_queries' is
		// the reliable QueryId → User mapping (needs OPERATE; without it the
		// lookup is empty and the request 403s, which is the safe default).
		const [rows] = await conn.query("SHOW PROC '/current_queries'");
		const owned = (rows as { QueryId?: string; User?: string }[]).find(
			(row) => row.QueryId === queryId && row.User === credentials.username
		);
		if (!owned) error(403, 'not your query');

		await conn.query(`KILL QUERY '${queryId}'`);
		return json({ killed: true });
	} finally {
		await conn.end().catch(() => {});
	}
};
