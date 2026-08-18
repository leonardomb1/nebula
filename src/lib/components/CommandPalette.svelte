<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import type { Workbench } from '$lib/workbench.svelte';

	let {
		workbench,
		onPickTable,
		onClose
	}: {
		workbench: Workbench;
		/** Inserts a qualified table name into the active editor. */
		onPickTable: (db: string, table: string) => void;
		onClose: () => void;
	} = $props();

	interface Entry {
		group: string;
		label: string;
		sub: string;
		run: () => void;
	}

	const LIMIT = 40;

	let query = $state('');
	let cursor = $state(0);

	// Tables only become searchable once their database has been fetched, so
	// the palette warms the whole schema cache the moment it opens.
	onMount(() => {
		for (const db of workbench.databases) void workbench.loadTables(db);
	});

	let entries = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		const hit = (text: string) => !needle || text.toLowerCase().includes(needle);
		const found: Entry[] = [];

		for (const tab of workbench.tabs) {
			if (!hit(tab.title)) continue;
			found.push({
				group: m.search_group_tabs(),
				label: tab.title,
				sub: tab.sql.trim().split('\n')[0]?.slice(0, 60) ?? '',
				run: () => (workbench.activeTabId = tab.id)
			});
		}

		for (const db of workbench.databases) {
			if (!hit(db)) continue;
			found.push({
				group: m.search_group_databases(),
				label: db,
				sub: '',
				run: () => {
					const tab = workbench.activeTab;
					if (tab) tab.database = db;
				}
			});
		}

		for (const db of workbench.databases) {
			const tables = workbench.tablesByDb[db];
			if (!Array.isArray(tables)) continue;
			for (const table of tables) {
				if (!hit(table.name) && !hit(db)) continue;
				found.push({
					group: m.search_group_tables(),
					label: table.name,
					sub: db,
					run: () => onPickTable(db, table.name)
				});
				if (found.length >= LIMIT) return found;
			}
		}
		return found;
	});

	let index = $derived(Math.min(cursor, Math.max(0, entries.length - 1)));

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') return onClose();
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			cursor = Math.min(index + 1, entries.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			cursor = Math.max(index - 1, 0);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			pick(index);
		}
	}

	function pick(at: number): void {
		entries[at]?.run();
		onClose();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="nb-anim-fade fixed inset-0 z-40 flex justify-center px-4 pt-[12vh] backdrop-blur-[4px]"
	style="background: var(--nb-scrim)"
	onclick={onClose}
>
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		tabindex="-1"
		role="dialog"
		aria-modal="true"
		aria-label={m.search()}
		class="nb-anim-modal flex max-h-[62vh] w-[560px] max-w-full flex-col overflow-hidden
		       rounded-2xl border border-line backdrop-blur-[30px]"
		style="background: var(--nb-modal); box-shadow: var(--nb-shadow)"
		onclick={(event) => event.stopPropagation()}
	>
		<div class="flex items-center gap-2.5 border-b border-line-soft px-3.5 py-3">
			<span class="text-ink-faint">⌕</span>
			<input
				{@attach (node) => node.focus()}
				bind:value={query}
				onkeydown={onKeydown}
				oninput={() => (cursor = 0)}
				placeholder={m.search_placeholder()}
				class="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-faint"
			/>
			<span class="shrink-0 rounded-lg border border-line px-2 py-0.5 font-mono text-[10px] text-ink-muted">
				⎋
			</span>
		</div>

		<div class="min-h-0 flex-1 overflow-auto p-1.5">
			{#if entries.length === 0}
				<p class="px-3 py-4 text-[12.5px] text-ink-muted">{m.search_empty()}</p>
			{/if}
			{#each entries as entry, i (entry.group + entry.sub + entry.label)}
				{#if i === 0 || entries[i - 1].group !== entry.group}
					<p
						class="px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-[0.1em] text-ink-muted uppercase"
					>
						{entry.group}
					</p>
				{/if}
				<button
					class="flex w-full items-baseline gap-2.5 rounded-[9px] px-2.5 py-[7px] text-left
					       {i === index ? 'bg-active' : 'hover:bg-hover'}"
					onclick={() => pick(i)}
					onmousemove={() => (cursor = i)}
				>
					<span class="truncate font-mono text-[12.5px]">{entry.label}</span>
					{#if entry.sub}
						<span class="ml-auto shrink-0 truncate text-[11px] text-ink-muted">{entry.sub}</span>
					{/if}
				</button>
			{/each}
		</div>

		<div class="border-t border-line-soft px-3.5 py-2 text-[11px] text-ink-muted">
			{m.search_hint()}
		</div>
	</div>
</div>
