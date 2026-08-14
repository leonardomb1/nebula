import { error, json, type RequestHandler } from '@sveltejs/kit';
import { connectAsUser, warehouseCredentials, WarehouseAuthRequired } from '$lib/server/db';

/**
 * One pass over information_schema for the command palette: databases, tables
 * and columns whose name contains the term. Runs as the signed-in user, so it
 * only ever returns objects they can already see.
 */
const PER_SECTION = 12;

export const GET: RequestHandler = async ({ url, locals }) => {
	const term = (url.searchParams.get('q') ?? '').trim();
	if (term.length < 1) return json({ databases: [], tables: [], columns: [] });

	let conn;
	try {
		conn = await connectAsUser(warehouseCredentials(locals.user!.username));
	} catch (err) {
		if (err instanceof WarehouseAuthRequired) error(401, 'warehouse sign-in required');
		throw err;
	}

	try {
		const like = `%${term}%`;
		const [rows] = await conn.query(
			`SELECT table_schema, table_name, column_name
			 FROM information_schema.columns
			 WHERE table_schema NOT IN ('information_schema', '_statistics_')
			   AND (table_schema LIKE ? OR table_name LIKE ? OR column_name LIKE ?)
			 LIMIT 2000`,
			[like, like, like]
		);

		const needle = term.toLowerCase();
		const hit = (value: string) => value.toLowerCase().includes(needle);

		const databases = new Set<string>();
		const tables = new Map<string, { db: string; name: string }>();
		const columns: { db: string; table: string; name: string }[] = [];

		for (const row of rows as {
			table_schema: string;
			table_name: string;
			column_name: string;
		}[]) {
			if (hit(row.table_schema)) databases.add(row.table_schema);
			if (hit(row.table_name) && tables.size < PER_SECTION * 4) {
				tables.set(`${row.table_schema}.${row.table_name}`, {
					db: row.table_schema,
					name: row.table_name
				});
			}
			if (hit(row.column_name) && columns.length < PER_SECTION * 4) {
				columns.push({ db: row.table_schema, table: row.table_name, name: row.column_name });
			}
		}

		return json({
			databases: [...databases].slice(0, PER_SECTION),
			tables: [...tables.values()].slice(0, PER_SECTION),
			columns: columns.slice(0, PER_SECTION)
		});
	} finally {
		await conn.end().catch(() => {});
	}
};
