/** Workbench state (Svelte 5 runes) + the client side of the query API. */

import { settings } from './settings.svelte';

export interface ColumnMeta {
	name: string;
	type: string;
}

export interface ResultSet {
	columns: ColumnMeta[];
	rows: unknown[][];
	rowCount: number;
	affectedRows: number | null;
	elapsedMs: number | null;
	truncated: boolean;
	finished: boolean;
	/** StarRocks query id — set when the run was profiled. */
	queryId: string | null;
}

export type RunStatus = 'idle' | 'starting' | 'running' | 'done' | 'error' | 'cancelled';

export interface RunView {
	id: string | null;
	status: RunStatus;
	resultsets: ResultSet[];
	errors: string[];
	elapsedMs: number | null;
	needsLogin: boolean;
}

function idleRun(): RunView {
	return { id: null, status: 'idle', resultsets: [], errors: [], elapsedMs: null, needsLogin: false };
}

export interface PlanNode {
	id: number;
	type: string;
	fragment: number;
	detail: string[];
	cardinality: number | null;
	subtitle: string | null;
	/** Present on profile overlays only. */
	actualRows?: number | null;
	timeMs?: number;
	timePct?: number;
}

export interface ProfileSummary {
	totalMs: number | null;
	cpuMs: number | null;
	wallMs: number | null;
	operatorMs: number | null;
	peakMemory: string | null;
}

export interface PlanEdge {
	from: number;
	to: number;
	kind: 'local' | 'exchange';
}

export type PlanState =
	| null
	| 'loading'
	| { nodes: PlanNode[]; edges: PlanEdge[]; raw?: string; summary?: ProfileSummary }
	| { error: string };

let tabCounter = 0;

export class Tab {
	readonly id = `tab-${++tabCounter}`;
	title = $state('');
	sql = $state('');
	database = $state<string | null>(null);
	profileEnabled = $state(false);
	run = $state<RunView>(idleRun());
	/** Result-panel selection: resultset index, -1 messages, -2 plan. */
	activeResult = $state(0);
	plan = $state<PlanState>(null);
	#source: EventSource | null = null;

	constructor(title: string) {
		this.title = title;
	}

	get running(): boolean {
		return this.run.status === 'starting' || this.run.status === 'running';
	}

	async execute(sqlOverride?: string): Promise<void> {
		const sql = (sqlOverride ?? this.sql).trim();
		if (!sql || this.running) return;

		this.#source?.close();
		this.run = { ...idleRun(), status: 'starting' };
		this.activeResult = 0;

		const res = await fetch('/api/query', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				sql,
				database: this.database ?? undefined,
				profile: this.profileEnabled,
				maxRows: settings.rowLimit
			})
		}).catch(() => null);

		if (!res || !res.ok) {
			this.run.status = 'error';
			this.run.errors.push(res ? `HTTP ${res.status}` : 'network error');
			return;
		}
		const { runId } = (await res.json()) as { runId: string };
		this.run.id = runId;
		this.run.status = 'running';
		this.#follow(runId);
	}

	#follow(runId: string): void {
		const source = new EventSource(`/api/query/${runId}/stream`);
		this.#source = source;

		source.onmessage = (message) => {
			const event = JSON.parse(message.data);
			switch (event.type) {
				case 'resultset':
					this.run.resultsets[event.statement] = {
						columns: event.columns,
						rows: [],
						rowCount: 0,
						affectedRows: null,
						elapsedMs: null,
						truncated: false,
						finished: false,
						queryId: null
					};
					this.activeResult = event.statement;
					break;
				case 'rows': {
					const set = this.run.resultsets[event.statement];
					if (set) {
						set.rows.push(...event.rows);
						set.rowCount = set.rows.length;
					}
					break;
				}
				case 'stmt_done': {
					const set = (this.run.resultsets[event.statement] ??= {
						columns: [],
						rows: [],
						rowCount: 0,
						affectedRows: null,
						elapsedMs: null,
						truncated: false,
						finished: false,
						queryId: null
					});
					set.affectedRows = event.affectedRows;
					set.elapsedMs = event.elapsedMs;
					set.truncated = event.truncated;
					set.finished = true;
					set.queryId = event.queryId ?? null;
					// The profile only exists for a run that asked for it; when the
					// user wants the plan up front, fetch it as soon as it can exist.
					if (settings.planFirst && set.queryId) void this.loadProfile(set.queryId);
					break;
				}
				case 'error':
					this.run.errors.push(event.message);
					if (event.needsLogin) this.run.needsLogin = true;
					this.activeResult = -1;
					break;
				case 'done':
					this.run.status = event.status;
					this.run.elapsedMs = event.elapsedMs;
					source.close();
					this.#source = null;
					break;
			}
		};

		source.onerror = () => {
			// EventSource retries on its own; a run that already ended never
			// reopens, so only a still-streaming run keeps the retry loop.
			if (this.run.status !== 'running') {
				source.close();
				this.#source = null;
			}
		};
	}

	async explain(sqlOverride?: string): Promise<void> {
		const sql = (sqlOverride ?? this.sql).trim();
		if (!sql || this.plan === 'loading') return;

		this.plan = 'loading';
		this.activeResult = -2;

		const res = await fetch('/api/explain', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ sql, database: this.database ?? undefined })
		}).catch(() => null);

		if (!res) {
			this.plan = { error: 'network error' };
			return;
		}
		const payload = await res.json().catch(() => null);
		this.plan = res.ok && payload ? payload : { error: payload?.error ?? `HTTP ${res.status}` };
	}

	/** Fetches the executed profile for a statement and shows it as the plan. */
	async loadProfile(queryId: string): Promise<void> {
		if (this.plan === 'loading') return;
		this.plan = 'loading';
		this.activeResult = -2;

		const res = await fetch('/api/profile', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ queryId })
		}).catch(() => null);

		if (!res) {
			this.plan = { error: 'network error' };
			return;
		}
		const payload = await res.json().catch(() => null);
		this.plan = res.ok && payload ? payload : { error: payload?.message ?? `HTTP ${res.status}` };
	}

	async cancel(): Promise<void> {
		if (!this.run.id || !this.running) return;
		await fetch(`/api/query/${this.run.id}/cancel`, { method: 'POST' }).catch(() => null);
	}

	dispose(): void {
		this.#source?.close();
	}
}

export interface TableInfo {
	name: string;
	columns: { name: string; type: string }[];
}

export class Workbench {
	tabs = $state<Tab[]>([]);
	activeTabId = $state<string | null>(null);
	databases = $state<string[]>([]);
	/** Schema cache shared by the explorer tree and editor completions. */
	tablesByDb = $state<Record<string, TableInfo[] | 'loading' | 'error'>>({});

	get activeTab(): Tab | null {
		return this.tabs.find((tab) => tab.id === this.activeTabId) ?? null;
	}

	newTab(baseTitle: string): Tab {
		const tab = new Tab(`${baseTitle} ${this.tabs.length + 1}`);
		// New tabs inherit the current database — the IDE-feel default.
		tab.database = this.activeTab?.database ?? this.databases[0] ?? null;
		tab.profileEnabled = settings.profileOnRun;
		this.tabs.push(tab);
		this.activeTabId = tab.id;
		return tab;
	}

	closeTab(tab: Tab): void {
		tab.dispose();
		const index = this.tabs.indexOf(tab);
		this.tabs = this.tabs.filter((t) => t !== tab);
		if (this.activeTabId === tab.id) {
			this.activeTabId = this.tabs[Math.min(index, this.tabs.length - 1)]?.id ?? null;
		}
	}

	async loadDatabases(): Promise<void> {
		const res = await fetch('/api/schema').catch(() => null);
		if (!res?.ok) return;
		const { databases } = (await res.json()) as { databases: string[] };
		this.databases = databases;
		for (const tab of this.tabs) tab.database ??= databases[0] ?? null;
	}

	async loadTables(db: string): Promise<void> {
		if (this.tablesByDb[db]) return;
		this.tablesByDb[db] = 'loading';
		const res = await fetch(`/api/schema?db=${encodeURIComponent(db)}`).catch(() => null);
		if (!res?.ok) {
			this.tablesByDb[db] = 'error';
			return;
		}
		const { tables } = (await res.json()) as { tables: TableInfo[] };
		this.tablesByDb[db] = tables;
	}
}
