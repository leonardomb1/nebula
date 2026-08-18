import { randomUUID } from 'node:crypto';
import type { Connection as CoreConnection } from 'mysql2';
import type { Connection } from 'mysql2/promise';
import { env } from '$env/dynamic/private';
import { connectAsUser, quoteIdent, warehouseCredentials, WarehouseAuthRequired } from './db';
import { jsonSafe } from './jsonSafe';
import { splitStatements } from './sqlSplitter';

/**
 * In-memory registry of query runs. Each run executes decoupled from any HTTP
 * socket; results land in a replay buffer that SSE subscribers stream from
 * (replay + follow), so a dropped tab can reattach mid-query. Single-process
 * by design (adapter-node) — swap for a shared store before scaling out.
 */

const MAX_ROWS = Number(env.MAX_RESULT_ROWS ?? 10_000);
const ROW_BATCH = 250;
const DONE_TTL_MS = 10 * 60 * 1000;

export type RunEvent =
	| { type: 'resultset'; statement: number; columns: { name: string; type: string }[] }
	| { type: 'rows'; statement: number; rows: unknown[][] }
	| {
			type: 'stmt_done';
			statement: number;
			rowCount: number;
			affectedRows: number | null;
			elapsedMs: number;
			truncated: boolean;
			queryId: string | null;
	  }
	| { type: 'error'; statement: number | null; message: string; needsLogin?: boolean }
	| { type: 'done'; status: RunStatus; elapsedMs: number };

export type RunStatus = 'running' | 'done' | 'error' | 'cancelled';

export interface QueryRun {
	id: string;
	username: string;
	sql: string;
	database: string | null;
	profile: boolean;
	/** Rows kept per statement — the client's request, clamped by MAX_ROWS. */
	maxRows: number;
	status: RunStatus;
	startedAt: number;
	endedAt: number | null;
	/** StarRocks connection id — what KILL QUERY takes. */
	connId: number | null;
	cancelRequested: boolean;
	events: RunEvent[];
	listeners: Set<(event: RunEvent) => void>;
}

const runs = new Map<string, QueryRun>();

function sweep(): void {
	const now = Date.now();
	for (const [id, run] of runs) {
		if (run.endedAt && now - run.endedAt > DONE_TTL_MS) runs.delete(id);
	}
}
setInterval(sweep, 60_000).unref();

export function getRun(id: string): QueryRun | null {
	return runs.get(id) ?? null;
}

export function subscribe(run: QueryRun, listener: (event: RunEvent) => void): () => void {
	run.listeners.add(listener);
	return () => run.listeners.delete(listener);
}

function emit(run: QueryRun, event: RunEvent): void {
	run.events.push(event);
	for (const listener of run.listeners) listener(event);
}

function finish(run: QueryRun, status: RunStatus): void {
	if (run.endedAt) return;
	run.status = status;
	run.endedAt = Date.now();
	emit(run, { type: 'done', status, elapsedMs: run.endedAt - run.startedAt });
}

/** mysql2 numeric column types → coarse display types for the grid. */
const TYPE_NAMES: Record<number, string> = {
	0: 'decimal', 1: 'tinyint', 2: 'smallint', 3: 'int', 4: 'float', 5: 'double',
	7: 'timestamp', 8: 'bigint', 9: 'int', 10: 'date', 11: 'time', 12: 'datetime',
	13: 'year', 15: 'varchar', 16: 'bit', 245: 'json', 246: 'decimal', 252: 'text',
	253: 'varchar', 254: 'char'
};

interface FieldPacket {
	name: string;
	columnType?: number;
	type?: number;
}

interface StatementStats {
	rowCount: number;
	affectedRows: number | null;
	elapsedMs: number;
	truncated: boolean;
}

function runStatement(
	run: QueryRun,
	conn: Connection,
	sql: string,
	index: number
): Promise<StatementStats> {
	return new Promise((resolve, reject) => {
		const started = Date.now();
		let rowCount = 0;
		let truncated = false;
		let sawResultset = false;
		let failed = false;
		let affectedRows: number | null = null;
		let batch: unknown[][] = [];

		const flush = () => {
			if (batch.length) {
				emit(run, { type: 'rows', statement: index, rows: batch });
				batch = [];
			}
		};

		// The callback (non-promise) API is the streaming one: rows arrive as
		// 'result' events instead of one giant array. The promise wrapper hides
		// the core connection from the types but carries it at runtime.
		const core = (conn as unknown as { connection: CoreConnection }).connection;
		const query = core.query({ sql, rowsAsArray: true });

		query.on('fields', (fields: FieldPacket[]) => {
			sawResultset = true;
			emit(run, {
				type: 'resultset',
				statement: index,
				columns: (fields ?? []).map((f) => ({
					name: f.name,
					type: TYPE_NAMES[f.columnType ?? f.type ?? -1] ?? 'unknown'
				}))
			});
		});

		query.on('result', (row: unknown) => {
			if (!sawResultset) {
				// OK packet from DML/DDL — no rows to stream.
				affectedRows = Number((row as { affectedRows?: number }).affectedRows ?? 0);
				return;
			}
			if (truncated) return;
			rowCount++;
			batch.push((row as unknown[]).map(jsonSafe));
			if (batch.length >= ROW_BATCH) flush();
			if (rowCount >= run.maxRows) {
				truncated = true;
				// Stop the server-side query too; destroying just the socket would
				// leave it running to completion in the warehouse.
				void killRun(run).catch(() => {});
			}
		});

		query.on('end', () => {
			// mysql2 fires 'end' right after 'error' too — a failed statement
			// must not also report success.
			if (failed) return;
			flush();
			resolve({ rowCount, affectedRows, elapsedMs: Date.now() - started, truncated });
		});

		query.on('error', (err: Error) => {
			failed = true;
			flush();
			reject(err);
		});
	});
}

/** KILL QUERY over a helper connection with the same credentials. */
async function killRun(run: QueryRun): Promise<void> {
	if (run.connId == null) return;
	const conn = await connectAsUser(warehouseCredentials(run.username));
	try {
		await conn.query(`KILL QUERY ${run.connId}`);
	} finally {
		await conn.end().catch(() => {});
	}
}

async function execute(run: QueryRun): Promise<void> {
	let conn: Connection | null = null;
	try {
		conn = await connectAsUser(warehouseCredentials(run.username));
		const [rows] = await conn.query('SELECT CONNECTION_ID() AS id');
		run.connId = Number((rows as { id: unknown }[])[0]?.id);

		if (run.database) await conn.query(`USE ${quoteIdent(run.database)}`);
		// Session-scoped, on the user's own connection — enables the profile
		// the plan viewer overlays later. Never a server-side config change.
		if (run.profile) await conn.query('SET enable_profile = true');

		const statements = splitStatements(run.sql);
		for (let i = 0; i < statements.length; i++) {
			if (run.cancelRequested) break;
			try {
				const stats = await runStatement(run, conn, statements[i], i);
				let queryId: string | null = null;
				if (run.profile) {
					const [idRows] = await conn.query('SELECT last_query_id() AS id');
					queryId = String((idRows as { id: unknown }[])[0]?.id ?? '') || null;
				}
				emit(run, { type: 'stmt_done', statement: i, ...stats, queryId });
			} catch (error) {
				// A killed query surfaces as an error on the executing connection.
				if (run.cancelRequested) break;
				const message = error instanceof Error ? error.message : String(error);
				emit(run, { type: 'error', statement: i, message });
				finish(run, 'error');
				return;
			}
		}
		finish(run, run.cancelRequested ? 'cancelled' : 'done');
	} catch (error) {
		const needsLogin = error instanceof WarehouseAuthRequired;
		const message = error instanceof Error ? error.message : String(error);
		emit(run, { type: 'error', statement: null, message, needsLogin });
		finish(run, 'error');
	} finally {
		if (conn) await conn.end().catch(() => conn?.destroy());
	}
}

export function startRun(
	username: string,
	sql: string,
	database: string | null,
	profile = false,
	maxRows?: number
): QueryRun {
	const run: QueryRun = {
		id: randomUUID(),
		username,
		sql,
		database,
		profile,
		// A client asking for more than the deployment allows still gets MAX_ROWS.
		maxRows: Math.min(MAX_ROWS, Math.max(1, Math.floor(maxRows ?? MAX_ROWS))),
		status: 'running',
		startedAt: Date.now(),
		endedAt: null,
		connId: null,
		cancelRequested: false,
		events: [],
		listeners: new Set()
	};
	runs.set(run.id, run);
	void execute(run);
	return run;
}

export async function cancelRun(run: QueryRun): Promise<void> {
	if (run.endedAt) return;
	run.cancelRequested = true;
	try {
		await killRun(run);
	} catch (error) {
		console.error(`query: could not kill run ${run.id}`, error);
	}
	// The executing connection errors out after the kill; if the connection was
	// never established (still connecting), finish here so subscribers unblock.
	if (run.connId == null) finish(run, 'cancelled');
}
