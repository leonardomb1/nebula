import { error, type RequestHandler } from '@sveltejs/kit';
import * as XLSX from 'xlsx';
import { getRun } from '$lib/server/queryRuns';

/**
 * Downloads one statement's result set from the run's replay buffer as CSV or
 * XLSX. Bounded by MAX_RESULT_ROWS, and only while the run is still in the
 * registry (runs are swept ~10 min after finishing).
 */
export const GET: RequestHandler = ({ params, url, locals }) => {
	const run = getRun(params.id!);
	if (!run || run.username !== locals.user!.username) error(404, 'unknown run');

	const statement = Number(url.searchParams.get('statement') ?? 0);
	const format = url.searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';

	let columns: string[] | null = null;
	const rows: unknown[][] = [];
	for (const event of run.events) {
		if (event.type === 'resultset' && event.statement === statement) {
			columns = event.columns.map((column) => column.name);
		} else if (event.type === 'rows' && event.statement === statement) {
			rows.push(...event.rows);
		}
	}
	if (!columns) error(404, 'no result set for this statement');

	const filename = `nebula-results-${run.id.slice(0, 8)}-${statement}`;

	if (format === 'xlsx') {
		const sheet = XLSX.utils.aoa_to_sheet([columns, ...rows]);
		const book = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(book, sheet, 'Results');
		const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
		return new Response(new Uint8Array(buffer), {
			headers: {
				'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'content-disposition': `attachment; filename="${filename}.xlsx"`
			}
		});
	}

	const escape = (cell: unknown): string => {
		if (cell === null || cell === undefined) return '';
		const text = typeof cell === 'object' ? JSON.stringify(cell) : String(cell);
		return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
	};
	// BOM so Excel detects UTF-8.
	const csv =
		'﻿' + [columns, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
	return new Response(csv, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="${filename}.csv"`
		}
	});
};
