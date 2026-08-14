<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { TableInfo } from '$lib/workbench.svelte';
	import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
	import Icon from './Icon.svelte';

	let {
		databases,
		tablesByDb,
		loadTables,
		onInsert,
		onRefresh,
		onUseDatabase,
		onSelectTop
	}: {
		databases: string[];
		tablesByDb: Record<string, TableInfo[] | 'loading' | 'error'>;
		loadTables: (db: string) => void;
		/** Double-click inserts a qualified name into the editor. */
		onInsert?: (text: string) => void;
		onRefresh?: () => void;
		onUseDatabase?: (db: string) => void;
		onSelectTop?: (db: string, table: string) => void;
	} = $props();

	let expandedDbs = $state<Record<string, boolean>>({});
	let expandedTables = $state<Record<string, boolean>>({});
	let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

	function toggleDb(db: string): void {
		expandedDbs[db] = !expandedDbs[db];
		if (expandedDbs[db]) loadTables(db);
	}

	// A refresh drops the schema cache; anything still expanded refetches itself.
	$effect(() => {
		for (const db of Object.keys(expandedDbs)) {
			if (expandedDbs[db] && !tablesByDb[db]) loadTables(db);
		}
	});

	const quoted = (db: string, table?: string) =>
		table ? `\`${db}\`.\`${table}\`` : `\`${db}\``;

	function copy(text: string): void {
		void navigator.clipboard?.writeText(text).catch(() => {});
	}

	function open(event: MouseEvent, items: MenuItem[]): void {
		event.preventDefault();
		menu = { x: event.clientX, y: event.clientY, items };
	}

	function dbMenu(db: string): MenuItem[] {
		return [
			{ label: m.set_current_db(), icon: 'check', action: () => onUseDatabase?.(db) },
			{ label: m.insert_name(), icon: 'plus', action: () => onInsert?.(quoted(db)) },
			{ label: m.copy_name(), icon: 'query', action: () => copy(db) },
			{ label: m.refresh(), icon: 'refresh', action: () => onRefresh?.() }
		];
	}

	function tableMenu(db: string, table: string): MenuItem[] {
		return [
			{ label: m.select_top(), icon: 'play', action: () => onSelectTop?.(db, table) },
			{ label: m.insert_name(), icon: 'plus', action: () => onInsert?.(quoted(db, table)) },
			{ label: m.copy_name(), icon: 'query', action: () => copy(`${db}.${table}`) },
			{ label: m.refresh(), icon: 'refresh', action: () => onRefresh?.() }
		];
	}

	function columnMenu(column: string): MenuItem[] {
		return [
			{ label: m.insert_name(), icon: 'plus', action: () => onInsert?.(`\`${column}\``) },
			{ label: m.copy_name(), icon: 'query', action: () => copy(column) }
		];
	}

	/** One row of the tree — 22px, full-bleed hover, VS Code density. */
	const ROW =
		'group flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[13px] transition hover:bg-surface-2';
</script>

<nav class="flex min-h-0 flex-1 flex-col overflow-hidden" aria-label={m.databases()}>
	<ul class="min-h-0 flex-1 overflow-auto pb-2">
		{#each databases as db (db)}
			{@const tables = tablesByDb[db]}
			<li>
				<button
					class="{ROW} pl-1.5"
					onclick={() => toggleDb(db)}
					oncontextmenu={(e) => open(e, dbMenu(db))}
				>
					<Icon
						name={expandedDbs[db] ? 'chevron-down' : 'chevron-right'}
						size={12}
						class="text-ink-dim"
					/>
					<Icon name="explorer" size={14} class="text-primary" />
					<span class="truncate">{db}</span>
				</button>

				{#if expandedDbs[db]}
					<ul
						class="relative before:absolute before:top-0 before:bottom-0 before:left-[13px] before:w-px before:bg-edge-soft"
					>
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
										ondblclick={() => onInsert?.(quoted(db, table.name))}
										oncontextmenu={(e) => open(e, tableMenu(db, table.name))}
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
												<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
												<li
													class="flex items-center gap-1.5 py-[3px] pr-2 pl-[38px] text-[12px] hover:bg-surface-2"
													oncontextmenu={(e) => open(e, columnMenu(column.name))}
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

{#if menu}
	<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}
