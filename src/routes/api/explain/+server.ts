import { error, json, type RequestHandler } from '@sveltejs/kit';
import { connectAsUser, quoteIdent, warehouseCredentials, WarehouseAuthRequired } from '$lib/server/db';
import { parsePlan } from '$lib/server/planParser';
import { splitStatements } from '$lib/server/sqlSplitter';

/** EXPLAIN VERBOSE of the first statement, parsed into a DAG. */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as {
		sql?: string;
		database?: string;
	} | null;

	const statement = splitStatements(body?.sql ?? '')[0];
	if (!statement) error(400, 'sql is required');

	let conn;
	try {
		conn = await connectAsUser(warehouseCredentials(locals.user!.username));
	} catch (err) {
		if (err instanceof WarehouseAuthRequired) error(401, 'warehouse sign-in required');
		throw err;
	}

	try {
		if (body?.database) await conn.query(`USE ${quoteIdent(body.database)}`);
		const [rows] = await conn.query(`EXPLAIN VERBOSE ${statement}`);
		const raw = (rows as Record<string, string>[]).map((row) => Object.values(row)[0]).join('\n');
		return json(parsePlan(raw));
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message }, { status: 422 });
	} finally {
		await conn.end().catch(() => {});
	}
};
