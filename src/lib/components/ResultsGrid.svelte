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
	class="h-full overflow-auto font-mono text-[12px]"
>
	<table class="border-separate border-spacing-0" style="min-width: 100%">
		<thead class="sticky top-0 z-20">
			<tr>
				<th
					class="sticky left-0 z-30 w-12 border-r border-b border-edge bg-surface-2 px-2 text-right text-[11px] font-normal text-ink-dim"
				>
					#
				</th>
				{#each resultset.columns as column (column.name)}
					<th
						class="border-r border-b border-edge bg-surface-2 px-3 py-1.5 text-left font-medium whitespace-nowrap text-ink"
					>
						{column.name}
						<span class="ml-1.5 text-[11px] font-normal tracking-wide text-ink-dim uppercase">
							{column.type}
						</span>
					</th>
				{/each}
				<!-- filler: lets the real columns hug their content instead of stretching -->
				<th class="w-full border-b border-edge bg-surface-2"></th>
			</tr>
		</thead>
		<tbody>
			<!-- spacer keeps the scrollbar honest while only ~a screen of rows exists -->
			<tr style="height: {first * ROW_HEIGHT}px"><td colspan={resultset.columns.length + 2}></td></tr>
			{#each slice as row, i (first + i)}
				<tr class="group" style="height: {ROW_HEIGHT}px">
					<td
						class="sticky left-0 z-10 border-r border-b border-edge-soft bg-surface px-2 text-right text-[11px] text-ink-dim group-hover:bg-surface-2"
					>
						{first + i + 1}
					</td>
					{#each row as cell, c (c)}
						<td
							class="max-w-md truncate border-r border-b border-edge-soft px-3 whitespace-nowrap group-hover:bg-surface-2/50 {cell ===
							null
								? 'text-ink-dim italic'
								: ''}"
						>
							{display(cell)}
						</td>
					{/each}
					<td class="border-b border-edge-soft group-hover:bg-surface-2/50"></td>
				</tr>
			{/each}
			<tr style="height: {Math.max(0, (resultset.rows.length - first - slice.length) * ROW_HEIGHT)}px">
				<td colspan={resultset.columns.length + 2}></td>
			</tr>
		</tbody>
	</table>
</div>
