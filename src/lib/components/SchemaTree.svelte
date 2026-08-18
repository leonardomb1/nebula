<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { TableInfo } from '$lib/workbench.svelte';

	let {
		databases,
		tablesByDb,
		activeDb,
		loadTables,
		onInsert
	}: {
		databases: string[];
		tablesByDb: Record<string, TableInfo[] | 'loading' | 'error'>;
		/** The current tab's database — its tables sit flat at the top. */
		activeDb: string | null;
		loadTables: (db: string) => void;
		/** Double-click inserts a qualified name into the editor. */
		onInsert?: (text: string) => void;
	} = $props();

	let expandedDbs = $state<Record<string, boolean>>({});
	let expandedTables = $state<Record<string, boolean>>({});

	// The current database is always open, so its tables are always wanted.
	$effect(() => {
		if (activeDb) loadTables(activeDb);
	});

	function toggleDb(db: string): void {
		expandedDbs[db] = !expandedDbs[db];
		if (expandedDbs[db]) loadTables(db);
	}

	function count(db: string): string {
		const tables = tablesByDb[db];
		return Array.isArray(tables) ? String(tables.length) : '';
	}

	let others = $derived(databases.filter((db) => db !== activeDb));
</script>

<nav class="flex h-full min-h-0 flex-col" aria-label={m.explorer()}>
	<div class="flex shrink-0 items-baseline gap-2 px-3.5 pt-3.5 pb-2.5">
		<span class="text-sm font-extrabold">{m.explorer()}</span>
		<span class="ml-auto truncate font-mono text-[11px] text-ink-muted">
			{activeDb ?? m.no_database()}
		</span>
	</div>

	<div class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto px-[7px] pb-[7px]">
		{#if activeDb}
			{@const tables = tablesByDb[activeDb]}
			{#if tables === 'loading'}
				<p class="px-3 py-1 text-[11px] text-ink-muted">{m.loading()}</p>
			{:else if tables === 'error'}
				<p class="px-3 py-1 text-[11px] text-err">{m.schema_error()}</p>
			{:else if Array.isArray(tables)}
				{#if tables.length === 0}
					<p class="px-3 py-1 text-[11px] text-ink-muted italic">{m.schema_empty()}</p>
				{/if}
				{#each tables as table (table.name)}
					{@const key = `${activeDb}.${table.name}`}
					<button
						class="flex h-[29px] shrink-0 items-center gap-[9px] rounded-[10px] px-[11px]
						       text-left font-mono text-xs transition-colors hover:bg-hover"
						onclick={() => (expandedTables[key] = !expandedTables[key])}
						ondblclick={() => onInsert?.(`\`${activeDb}\`.\`${table.name}\``)}
						title={key}
					>
						<span class="text-[9px] text-ink-faint">▦</span>
						<span class="truncate">{table.name}</span>
					</button>
					{#if expandedTables[key]}
						<ul class="mb-1 ml-[22px] shrink-0 border-l border-line-soft pl-2">
							{#each table.columns as column (column.name)}
								<li class="flex justify-between gap-2 py-[3px] font-mono text-[11px]">
									<span class="truncate">{column.name}</span>
									<span class="shrink-0 text-ink-faint">{column.type}</span>
								</li>
							{/each}
						</ul>
					{/if}
				{/each}
			{/if}
		{/if}

		{#if others.length && activeDb}
			<div class="my-1.5 h-px shrink-0 bg-line-soft"></div>
		{/if}

		{#each others as db (db)}
			{@const tables = tablesByDb[db]}
			<button
				class="flex h-[29px] shrink-0 items-center gap-[9px] rounded-[10px] px-[11px] text-left
				       font-mono text-[12.5px] text-ink-muted transition-colors hover:bg-hover"
				onclick={() => toggleDb(db)}
			>
				<span class="w-2 text-[8px]">{expandedDbs[db] ? '▾' : '▸'}</span>
				<span class="truncate">{db}</span>
				<span class="ml-auto shrink-0 font-mono text-[10.5px] text-ink-faint">{count(db)}</span>
			</button>
			{#if expandedDbs[db]}
				<div class="mb-1 ml-[22px] flex shrink-0 flex-col border-l border-line-soft pl-1">
					{#if tables === 'loading'}
						<p class="px-2 py-1 text-[11px] text-ink-muted">{m.loading()}</p>
					{:else if tables === 'error'}
						<p class="px-2 py-1 text-[11px] text-err">{m.schema_error()}</p>
					{:else if Array.isArray(tables)}
						{#if tables.length === 0}
							<p class="px-2 py-1 text-[11px] text-ink-muted italic">{m.schema_empty()}</p>
						{/if}
						{#each tables as table (table.name)}
							<button
								class="flex h-[26px] items-center gap-[9px] rounded-[9px] px-2 text-left
								       font-mono text-[11.5px] transition-colors hover:bg-hover"
								ondblclick={() => onInsert?.(`\`${db}\`.\`${table.name}\``)}
								onclick={() => onInsert?.(`\`${db}\`.\`${table.name}\``)}
								title="{db}.{table.name}"
							>
								<span class="text-[9px] text-ink-faint">▦</span>
								<span class="truncate">{table.name}</span>
							</button>
						{/each}
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</nav>
