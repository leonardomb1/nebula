import { error, json, type RequestHandler } from '@sveltejs/kit';
import { connectAsUser, warehouseCredentials, WarehouseAuthRequired } from '$lib/server/db';
import { jsonSafe } from '$lib/server/jsonSafe';

/**
 * Live activity: connections (SHOW FULL PROCESSLIST) and executing queries
 * with resource usage (SHOW PROC '/current_queries'), merged client-side on
 * QueryId. StarRocks scopes PROCESSLIST to the user's own sessions unless the
 * account has broader rights; '/current_queries' needs OPERATE and comes back
 * empty without it — the UI treats that as "no data", not an error.
 */
export const GET: RequestHandler = async ({ locals }) => {
	let conn;
	try {
		conn = await connectAsUser(warehouseCredentials(locals.user!.username));
	} catch (err) {
		if (err instanceof WarehouseAuthRequired) error(401, 'warehouse sign-in required');
		throw err;
	}

	try {
		const [processRows] = await conn.query('SHOW FULL PROCESSLIST');
		let queryRows: unknown[] = [];
		try {
			const [rows] = await conn.query("SHOW PROC '/current_queries'");
			queryRows = rows as unknown[];
		} catch {
			// No OPERATE privilege — the processlist alone still renders.
		}

		return json({
			ts: Date.now(),
			processlist: (processRows as Record<string, unknown>[]).map((row) => jsonSafe(row)),
			currentQueries: (queryRows as Record<string, unknown>[]).map((row) => jsonSafe(row))
		});
	} finally {
		await conn.end().catch(() => {});
	}
};
