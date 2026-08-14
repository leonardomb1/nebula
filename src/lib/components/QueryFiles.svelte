<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { QueryFile } from '$lib/workbench.svelte';
	import Icon from './Icon.svelte';

	let {
		files,
		activeFile = null,
		renaming = $bindable(null),
		onOpen,
		onNew,
		onRename,
		onDelete
	}: {
		files: QueryFile[];
		/** File held by the active tab, highlighted like VS Code's open editor. */
		activeFile?: string | null;
		/** Name currently being renamed inline — the workbench sets it after a save. */
		renaming?: string | null;
		onOpen: (name: string) => void;
		onNew: () => void;
		onRename: (from: string, to: string) => void;
		onDelete: (name: string) => void;
	} = $props();

	let open = $state(true);

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
</script>

<section class="flex shrink-0 flex-col">
	<header class="flex h-7 items-center gap-1 pr-1 pl-1.5">
		<button
			class="flex min-w-0 flex-1 items-center gap-1 text-[11px] font-semibold tracking-wider text-ink-muted uppercase hover:text-ink"
			onclick={() => (open = !open)}
		>
			<Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
			<span class="truncate">{m.queries()}</span>
		</button>
		<button
			class="flex h-5 w-5 items-center justify-center rounded text-ink-muted transition hover:bg-surface-2 hover:text-ink"
			title={m.new_query()}
			aria-label={m.new_query()}
			onclick={onNew}
		>
			<Icon name="plus" size={14} />
		</button>
	</header>

	{#if open}
		<ul class="max-h-56 overflow-auto pb-1">
			{#if files.length === 0}
				<li class="py-1 pl-6 text-xs text-ink-dim italic">{m.no_queries()}</li>
			{/if}
			{#each files as file (file.name)}
				<li
					class="group flex items-center gap-1.5 py-[3px] pr-1 pl-6 text-[13px] transition {file.name ===
					activeFile
						? 'bg-surface-2 text-ink'
						: 'text-ink-muted hover:bg-surface-2 hover:text-ink'}"
				>
					{#if renaming === file.name}
						<Icon name="query" size={14} class="text-ink-dim" />
						<input
							class="min-w-0 flex-1 rounded border border-primary-strong bg-bg px-1 py-0 text-[13px] text-ink"
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
							<Icon name="query" size={14} class="text-secondary" />
							<span class="truncate">{label(file.name)}</span>
						</button>
						<button
							class="hidden h-5 w-5 items-center justify-center rounded text-ink-muted group-hover:flex hover:bg-surface-3 hover:text-ink"
							title={m.rename()}
							aria-label={m.rename()}
							onclick={() => (renaming = file.name)}
						>
							<Icon name="pencil" size={12} />
						</button>
						<button
							class="hidden h-5 w-5 items-center justify-center rounded text-ink-muted group-hover:flex hover:bg-surface-3 hover:text-err"
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
	{/if}
</section>
