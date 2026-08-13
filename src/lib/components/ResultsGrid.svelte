<script lang="ts">
	import type { ResultSet } from '$lib/workbench.svelte';

	let { resultset }: { resultset: ResultSet } = $props();

	const ROW_HEIGHT = 26;
	const OVERSCAN = 10;

	let viewport = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);
	let viewportHeight = $state(0);

	let first = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
	let visible = $derived(Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2);
	let slice = $derived(resultset.rows.slice(first, first + visible));

	function display(cell: unknown): string {
		if (cell === null) return 'NULL';
		if (typeof cell === 'object') return JSON.stringify(cell);
		return String(cell);
	}
</script>

<div
	bind:this={viewport}
	bind:clientHeight={viewportHeight}
	onscroll={() => (scrollTop = viewport?.scrollTop ?? 0)}
	class="h-full overflow-auto font-mono text-xs"
>
	<table class="border-separate border-spacing-0" style="min-width: 100%">
		<thead class="sticky top-0 z-10">
			<tr>
				<th class="w-12 border-r border-b border-edge bg-surface-2 px-2 text-right text-ink-muted">
					#
				</th>
				{#each resultset.columns as column (column.name)}
					<th
						class="border-r border-b border-edge bg-surface-2 px-3 py-1 text-left font-medium whitespace-nowrap"
					>
						{column.name}
						<span class="ml-1 font-normal text-ink-muted">{column.type}</span>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			<!-- spacer keeps the scrollbar honest while only ~a screen of rows exists -->
			<tr style="height: {first * ROW_HEIGHT}px"><td colspan={resultset.columns.length + 1}></td></tr>
			{#each slice as row, i (first + i)}
				<tr class="hover:bg-surface-2/60" style="height: {ROW_HEIGHT}px">
					<td class="border-r border-b border-edge/40 px-2 text-right text-ink-muted">
						{first + i + 1}
					</td>
					{#each row as cell, c (c)}
						<td
							class="max-w-md truncate border-r border-b border-edge/40 px-3 whitespace-nowrap {cell ===
							null
								? 'text-ink-muted italic'
								: ''}"
						>
							{display(cell)}
						</td>
					{/each}
				</tr>
			{/each}
			<tr style="height: {Math.max(0, (resultset.rows.length - first - slice.length) * ROW_HEIGHT)}px">
				<td colspan={resultset.columns.length + 1}></td>
			</tr>
		</tbody>
	</table>
</div>
