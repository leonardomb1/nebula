<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let {
		databases,
		onInsert
	}: {
		databases: string[];
		/** Double-click inserts a qualified name into the editor. */
		onInsert?: (text: string) => void;
	} = $props();

	interface TableInfo {
		name: string;
		columns: { name: string; type: string }[];
	}

	let expandedDbs = $state<Record<string, boolean>>({});
	let expandedTables = $state<Record<string, boolean>>({});
	let tablesByDb = $state<Record<string, TableInfo[] | 'loading' | 'error'>>({});

	async function toggleDb(db: string): Promise<void> {
		expandedDbs[db] = !expandedDbs[db];
		if (!expandedDbs[db] || tablesByDb[db]) return;

		tablesByDb[db] = 'loading';
		const res = await fetch(`/api/schema?db=${encodeURIComponent(db)}`).catch(() => null);
		if (!res?.ok) {
			tablesByDb[db] = 'error';
			return;
		}
		const { tables } = (await res.json()) as { tables: TableInfo[] };
		tablesByDb[db] = tables;
	}
</script>

<nav class="h-full overflow-auto p-2 text-sm" aria-label={m.explorer()}>
	<p class="px-2 pb-2 text-xs font-medium tracking-wider text-ink-muted uppercase">
		{m.explorer()}
	</p>
	<ul>
		{#each databases as db (db)}
			{@const tables = tablesByDb[db]}
			<li>
				<button
					class="flex w-full items-center gap-1 rounded px-2 py-0.5 text-left hover:bg-surface-2"
					onclick={() => toggleDb(db)}
				>
					<span class="inline-block w-3 text-ink-muted">{expandedDbs[db] ? '▾' : '▸'}</span>
					<span class="truncate">{db}</span>
				</button>
				{#if expandedDbs[db]}
					<ul class="ml-4 border-l border-edge/60 pl-1">
						{#if tables === 'loading'}
							<li class="px-2 py-0.5 text-xs text-ink-muted">{m.loading()}</li>
						{:else if tables === 'error'}
							<li class="px-2 py-0.5 text-xs" style="color: var(--nebula-err)">
								{m.schema_error()}
							</li>
						{:else if Array.isArray(tables)}
							{#if tables.length === 0}
								<li class="px-2 py-0.5 text-xs text-ink-muted italic">{m.schema_empty()}</li>
							{/if}
							{#each tables as table (table.name)}
								{@const key = `${db}.${table.name}`}
								<li>
									<button
										class="flex w-full items-center gap-1 rounded px-2 py-0.5 text-left hover:bg-surface-2"
										onclick={() => (expandedTables[key] = !expandedTables[key])}
										ondblclick={() => onInsert?.(`\`${db}\`.\`${table.name}\``)}
										title={key}
									>
										<span class="inline-block w-3 text-ink-muted">
											{expandedTables[key] ? '▾' : '▸'}
										</span>
										<span class="truncate text-secondary">{table.name}</span>
									</button>
									{#if expandedTables[key]}
										<ul class="ml-4 border-l border-edge/60 pl-1">
											{#each table.columns as column (column.name)}
												<li class="flex justify-between gap-2 px-2 py-0.5 font-mono text-xs">
													<span class="truncate">{column.name}</span>
													<span class="shrink-0 text-ink-muted">{column.type}</span>
												</li>
											{/each}
										</ul>
									{/if}
								</li>
							{/each}
						{/if}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
</nav>
