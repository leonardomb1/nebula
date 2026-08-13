import { error, json, type RequestHandler } from '@sveltejs/kit';
import { connectAsUser, warehouseCredentials, WarehouseAuthRequired } from '$lib/server/db';

interface MetricRow {
	NAME: string;
	LABELS: string | null;
	VALUE: string;
}

function labelOf(row: MetricRow, key: string): string | null {
	try {
		return row.LABELS ? ((JSON.parse(row.LABELS) as Record<string, string>)[key] ?? null) : null;
	} catch {
		return null;
	}
}

/**
 * One snapshot of the cluster's health counters, straight over SQL
 * (information_schema.fe_metrics / be_metrics — no Prometheus dependency).
 * Counters (queryTotal, scanBytes) are cumulative; the client derives rates
 * from deltas between polls.
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
		const [feRows] = await conn.query(
			`SELECT NAME, LABELS, VALUE FROM information_schema.fe_metrics
			 WHERE NAME IN ('query_total','query_err','connection_total','query_latency','jvm_heap_size_bytes')`
		);
		const [beRows] = await conn.query(
			`SELECT NAME, LABELS, VALUE FROM information_schema.be_metrics
			 WHERE NAME IN ('process_mem_bytes','query_scan_bytes','query_scan_rows')`
		);

		const fe = feRows as MetricRow[];
		const be = beRows as MetricRow[];

		const sum = (rows: MetricRow[], name: string, label?: [string, string]) =>
			rows
				.filter(
					(row) =>
						row.NAME === name && (!label || labelOf(row, label[0]) === label[1])
				)
				.reduce((total, row) => total + Number(row.VALUE), 0);

		return json({
			ts: Date.now(),
			queryTotal: sum(fe, 'query_total'),
			queryErr: sum(fe, 'query_err'),
			connections: sum(fe, 'connection_total'),
			latencyMs: {
				p50: sum(fe, 'query_latency', ['type', '50_quantile']),
				p95: sum(fe, 'query_latency', ['type', '95_quantile']),
				p99: sum(fe, 'query_latency', ['type', '99_quantile'])
			},
			heap: {
				used: sum(fe, 'jvm_heap_size_bytes', ['type', 'used']),
				max: sum(fe, 'jvm_heap_size_bytes', ['type', 'max'])
			},
			beMemBytes: sum(be, 'process_mem_bytes'),
			scanBytes: sum(be, 'query_scan_bytes'),
			scanRows: sum(be, 'query_scan_rows')
		});
	} finally {
		await conn.end().catch(() => {});
	}
};
