/** Workbench state (Svelte 5 runes) + the client side of the query API. */

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

let tabCounter = 0;

export class Tab {
	readonly id = `tab-${++tabCounter}`;
	title = $state('');
	sql = $state('');
	database = $state<string | null>(null);
	run = $state<RunView>(idleRun());
	/** Result-panel selection: index into resultsets, or -1 for messages. */
	activeResult = $state(0);
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
			body: JSON.stringify({ sql, database: this.database ?? undefined })
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
						finished: false
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
						finished: false
					});
					set.affectedRows = event.affectedRows;
					set.elapsedMs = event.elapsedMs;
					set.truncated = event.truncated;
					set.finished = true;
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

	async cancel(): Promise<void> {
		if (!this.run.id || !this.running) return;
		await fetch(`/api/query/${this.run.id}/cancel`, { method: 'POST' }).catch(() => null);
	}

	dispose(): void {
		this.#source?.close();
	}
}

export class Workbench {
	tabs = $state<Tab[]>([]);
	activeTabId = $state<string | null>(null);
	databases = $state<string[]>([]);

	get activeTab(): Tab | null {
		return this.tabs.find((tab) => tab.id === this.activeTabId) ?? null;
	}

	newTab(baseTitle: string): Tab {
		const tab = new Tab(`${baseTitle} ${this.tabs.length + 1}`);
		// New tabs inherit the current database — the IDE-feel default.
		tab.database = this.activeTab?.database ?? this.databases[0] ?? null;
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
}
