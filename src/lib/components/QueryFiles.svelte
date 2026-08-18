<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { QueryFile } from '$lib/workbench.svelte';
	import ContextMenu, { type MenuItem } from './ContextMenu.svelte';
	import Icon from './Icon.svelte';

	let {
		files,
		activeFile = null,
		renaming = $bindable(null),
		onOpen,
		onRename,
		onDelete
	}: {
		files: QueryFile[];
		/** File held by the active tab, highlighted like VS Code's open editor. */
		activeFile?: string | null;
		/** Name currently being renamed inline — the workbench sets it after a save. */
		renaming?: string | null;
		onOpen: (name: string) => void;
		onRename: (from: string, to: string) => void;
		onDelete: (name: string) => void;
	} = $props();

	let menu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

	const label = (name: string) => name.replace(/\.sql$/i, '');

	/** Inline rename input: focused and selected the moment it appears. */
	function selectAll(node: HTMLInputElement) {
		node.focus();
		node.select();
	}

	function commit(from: string, value: string): void {
		renaming = null;
		if (value.trim()) onRename(from, value.trim());
	}

	function fileMenu(name: string): MenuItem[] {
		return [
			{ label: m.open_query(), icon: 'query', action: () => onOpen(name) },
			{ label: m.rename(), icon: 'pencil', action: () => (renaming = name) },
			{
				label: m.delete(),
				icon: 'trash',
				action: () => confirm(m.delete_query_confirm({ name: label(name) })) && onDelete(name)
			}
		];
	}
</script>

<ul class="min-h-0 flex-1 overflow-auto pb-1">
	{#if files.length === 0}
		<li class="py-1 pl-4 text-xs text-ink-faint italic">{m.no_queries()}</li>
	{/if}
	{#each files as file (file.name)}
		<li
			class="group flex items-center gap-1.5 py-[3px] pr-1 pl-3 text-[13px] transition {file.name ===
			activeFile
				? 'bg-hover text-ink'
				: 'text-ink-muted hover:bg-hover hover:text-ink'}"
			oncontextmenu={(e) => {
				e.preventDefault();
				menu = { x: e.clientX, y: e.clientY, items: fileMenu(file.name) };
			}}
		>
			{#if renaming === file.name}
				<Icon name="query" size={14} class="text-ink-faint" />
				<input
					class="min-w-0 flex-1 rounded border border-accent bg-bg px-1 py-0 text-[13px] text-ink"
					value={label(file.name)}
					use:selectAll
					onblur={(e) => commit(file.name, e.currentTarget.value)}
					onkeydown={(e) => {
						if (e.key === 'Enter') commit(file.name, e.currentTarget.value);
						else if (e.key === 'Escape') renaming = null;
					}}
				/>
			{:else}
				<button
					class="flex min-w-0 flex-1 items-center gap-1.5 text-left"
					onclick={() => onOpen(file.name)}
					ondblclick={() => (renaming = file.name)}
					title={file.name}
				>
					<Icon name="query" size={14} class="text-accent-soft" />
					<span class="truncate">{label(file.name)}</span>
				</button>
				<button
					class="hidden h-5 w-5 items-center justify-center rounded text-ink-muted group-hover:flex hover:bg-active hover:text-ink"
					title={m.rename()}
					aria-label={m.rename()}
					onclick={() => (renaming = file.name)}
				>
					<Icon name="pencil" size={12} />
				</button>
				<button
					class="hidden h-5 w-5 items-center justify-center rounded text-ink-muted group-hover:flex hover:bg-active hover:text-err"
					title={m.delete()}
					aria-label={m.delete()}
					onclick={() => {
						if (confirm(m.delete_query_confirm({ name: label(file.name) }))) onDelete(file.name);
					}}
				>
					<Icon name="trash" size={12} />
				</button>
			{/if}
		</li>
	{/each}
</ul>

{#if menu}
	<ContextMenu x={menu.x} y={menu.y} items={menu.items} onclose={() => (menu = null)} />
{/if}
