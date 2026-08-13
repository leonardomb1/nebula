import { error, json, type RequestHandler } from '@sveltejs/kit';
import { connectAsUser, warehouseCredentials, WarehouseAuthRequired } from '$lib/server/db';

/**
 * Schema tree data, as the signed-in user (StarRocks trims what they can't
 * see). No db param → databases; ?db=<name> → tables with their columns.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const db = url.searchParams.get('db');

	let conn;
	try {
		conn = await connectAsUser(warehouseCredentials(locals.user!.username));
	} catch (err) {
		if (err instanceof WarehouseAuthRequired) error(401, 'warehouse sign-in required');
		throw err;
	}

	try {
		if (!db) {
			const [rows] = await conn.query<never[]>('SHOW DATABASES');
			const databases = (rows as Record<string, string>[])
				.map((row) => Object.values(row)[0])
				.filter((name) => name !== 'information_schema' && name !== '_statistics_');
			return json({ databases });
		}

		const [rows] = await conn.query(
			`SELECT table_name, column_name, data_type
			 FROM information_schema.columns
			 WHERE table_schema = ?
			 ORDER BY table_name, ordinal_position`,
			[db]
		);
		const tables = new Map<string, { name: string; type: string }[]>();
		for (const row of rows as { table_name: string; column_name: string; data_type: string }[]) {
			const columns = tables.get(row.table_name) ?? [];
			columns.push({ name: row.column_name, type: row.data_type });
			tables.set(row.table_name, columns);
		}
		return json({
			tables: [...tables.entries()].map(([name, columns]) => ({ name, columns }))
		});
	} finally {
		await conn.end().catch(() => {});
	}
};
