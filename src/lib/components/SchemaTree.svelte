<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { TableInfo } from '$lib/workbench.svelte';
	import Icon from './Icon.svelte';

	let {
		databases,
		tablesByDb,
		loadTables,
		onInsert
	}: {
		databases: string[];
		tablesByDb: Record<string, TableInfo[] | 'loading' | 'error'>;
		loadTables: (db: string) => void;
		/** Double-click inserts a qualified name into the editor. */
		onInsert?: (text: string) => void;
	} = $props();

	let expandedDbs = $state<Record<string, boolean>>({});
	let expandedTables = $state<Record<string, boolean>>({});
	let open = $state(true);

	function toggleDb(db: string): void {
		expandedDbs[db] = !expandedDbs[db];
		if (expandedDbs[db]) loadTables(db);
	}

	/** One row of the tree — 22px, full-bleed hover, VS Code density. */
	const ROW =
		'group flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[13px] transition hover:bg-surface-2';
</script>

<nav class="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={m.databases()}>
	<header class="flex h-7 shrink-0 items-center pr-1 pl-1.5">
		<button
			class="flex min-w-0 flex-1 items-center gap-1 text-[11px] font-semibold tracking-wider text-ink-muted uppercase hover:text-ink"
			onclick={() => (open = !open)}
		>
			<Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
			<span class="truncate">{m.databases()}</span>
		</button>
	</header>

	<ul class="min-h-0 flex-1 overflow-auto pb-2" hidden={!open}>
		{#each databases as db (db)}
			{@const tables = tablesByDb[db]}
			<li>
				<button class="{ROW} pl-1.5" onclick={() => toggleDb(db)}>
					<Icon
						name={expandedDbs[db] ? 'chevron-down' : 'chevron-right'}
						size={12}
						class="text-ink-dim"
					/>
					<Icon name="explorer" size={14} class="text-primary" />
					<span class="truncate">{db}</span>
				</button>

				{#if expandedDbs[db]}
					<ul class="relative before:absolute before:top-0 before:bottom-0 before:left-[13px] before:w-px before:bg-edge-soft">
						{#if tables === 'loading'}
							<li class="flex items-center gap-1.5 py-1 pl-8 text-xs text-ink-dim">
								<Icon name="spinner" size={12} class="animate-spin" />
								{m.loading()}
							</li>
						{:else if tables === 'error'}
							<li class="flex items-center gap-1.5 py-1 pl-8 text-xs text-err">
								<Icon name="alert" size={12} />
								{m.schema_error()}
							</li>
						{:else if Array.isArray(tables)}
							{#if tables.length === 0}
								<li class="py-1 pl-8 text-xs text-ink-dim italic">{m.schema_empty()}</li>
							{/if}
							{#each tables as table (table.name)}
								{@const key = `${db}.${table.name}`}
								<li>
									<button
										class="{ROW} pl-5"
										onclick={() => (expandedTables[key] = !expandedTables[key])}
										ondblclick={() => onInsert?.(`\`${db}\`.\`${table.name}\``)}
										title={key}
									>
										<Icon
											name={expandedTables[key] ? 'chevron-down' : 'chevron-right'}
											size={12}
											class="text-ink-dim"
										/>
										<Icon name="table" size={14} class="text-secondary" />
										<span class="truncate">{table.name}</span>
									</button>

									{#if expandedTables[key]}
										<ul>
											{#each table.columns as column (column.name)}
												<li
													class="flex items-center gap-1.5 py-[3px] pr-2 pl-[38px] text-[12px] hover:bg-surface-2"
												>
													<Icon name="column" size={13} class="text-ink-dim" />
													<span class="truncate">{column.name}</span>
													<span class="ml-auto shrink-0 font-mono text-[11px] text-ink-dim">
														{column.type}
													</span>
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
