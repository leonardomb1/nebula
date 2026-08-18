<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { QueryFile } from '$lib/workbench.svelte';
	import Icon, { type IconName } from './Icon.svelte';

	let {
		files,
		onclose,
		onOpenFile,
		onUseDatabase,
		onSelectTop,
		onInsert
	}: {
		files: QueryFile[];
		onclose: () => void;
		onOpenFile: (name: string) => void;
		onUseDatabase: (db: string) => void;
		onSelectTop: (db: string, table: string) => void;
		onInsert: (text: string) => void;
	} = $props();

	interface Hit {
		icon: IconName;
		label: string;
		hint: string;
		section: string;
		run: () => void;
	}

	let term = $state('');
	let hits = $state<Hit[]>([]);
	let active = $state(0);
	let loading = $state(false);

	/** Saved queries live in the client already — matched without a round trip. */
	function fileHits(needle: string): Hit[] {
		return files
			.filter((file) => file.name.toLowerCase().includes(needle))
			.slice(0, 8)
			.map((file) => ({
				icon: 'query' as const,
				label: file.name.replace(/\.sql$/i, ''),
				hint: '',
				section: m.queries(),
				run: () => onOpenFile(file.name)
			}));
	}

	async function search(raw: string): Promise<void> {
		const needle = raw.trim().toLowerCase();
		if (!needle) {
			hits = [];
			return;
		}

		const local = fileHits(needle);
		hits = local;
		active = 0;
		loading = true;

		const res = await fetch(`/api/search?q=${encodeURIComponent(raw.trim())}`).catch(() => null);
		loading = false;
		// A slower response for an older term must not overwrite the current one.
		if (!res?.ok || raw !== term) return;

		const found = (await res.json()) as {
			databases: string[];
			tables: { db: string; name: string }[];
			columns: { db: string; table: string; name: string }[];
		};

		hits = [
			...local,
			...found.databases.map((db) => ({
				icon: 'explorer' as const,
				label: db,
				hint: '',
				section: m.databases(),
				run: () => onUseDatabase(db)
			})),
			...found.tables.map((table) => ({
				icon: 'table' as const,
				label: table.name,
				hint: table.db,
				section: m.tables(),
				run: () => onSelectTop(table.db, table.name)
			})),
			...found.columns.map((column) => ({
				icon: 'column' as const,
				label: column.name,
				hint: `${column.db}.${column.table}`,
				section: m.columns(),
				run: () => onInsert(`\`${column.name}\``)
			}))
		];
		active = 0;
	}

	let debounce: ReturnType<typeof setTimeout>;
	$effect(() => {
		const raw = term;
		clearTimeout(debounce);
		debounce = setTimeout(() => void search(raw), 160);
		return () => clearTimeout(debounce);
	});

	function choose(hit: Hit | undefined): void {
		if (!hit) return;
		hit.run();
		onclose();
	}

	function onKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') onclose();
		else if (event.key === 'ArrowDown') {
			event.preventDefault();
			active = Math.min(hits.length - 1, active + 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			active = Math.max(0, active - 1);
		} else if (event.key === 'Enter') {
			event.preventDefault();
			choose(hits[active]);
		}
	}

	function focus(node: HTMLInputElement) {
		node.focus();
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-40 flex justify-center bg-black/40 pt-[12vh]"
	onclick={(e) => e.target === e.currentTarget && onclose()}
>
	<div
		class="flex h-fit max-h-[60vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-line bg-hover shadow-2xl shadow-black/50"
	>
		<div class="flex items-center gap-2 border-b border-line px-3">
			<Icon name="search" size={15} class="text-ink-faint" />
			<!-- svelte-ignore a11y_autofocus -->
			<input
				bind:value={term}
				use:focus
				onkeydown={onKeydown}
				placeholder={m.search_placeholder()}
				class="h-11 min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-ink-faint focus:outline-none"
			/>
			{#if loading}
				<Icon name="spinner" size={14} class="animate-spin text-ink-faint" />
			{/if}
			<kbd class="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">Esc</kbd>
		</div>

		<ul class="overflow-auto py-1">
			{#each hits as hit, i (hit.section + hit.hint + hit.label)}
				{@const first = i === 0 || hits[i - 1].section !== hit.section}
				{#if first}
					<li
						class="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-widest text-ink-faint uppercase"
					>
						{hit.section}
					</li>
				{/if}
				<li>
					<button
						class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] {i === active
							? 'bg-hover text-ink'
							: 'text-ink-muted hover:bg-active'}"
						onmouseenter={() => (active = i)}
						onclick={() => choose(hit)}
					>
						<Icon name={hit.icon} size={14} class="text-ink-faint" />
						<span class="truncate">{hit.label}</span>
						{#if hit.hint}
							<span class="ml-auto truncate pl-3 font-mono text-[11px] text-ink-faint">
								{hit.hint}
							</span>
						{/if}
					</button>
				</li>
			{/each}

			{#if term.trim() && hits.length === 0 && !loading}
				<li class="px-3 py-6 text-center text-[12px] text-ink-faint">{m.search_empty()}</li>
			{/if}
		</ul>
	</div>
</div>
