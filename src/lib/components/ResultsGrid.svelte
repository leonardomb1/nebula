<script lang="ts">
	import { settings } from '$lib/settings.svelte';
	import type { ResultSet } from '$lib/workbench.svelte';

	let { resultset }: { resultset: ResultSet } = $props();

	const OVERSCAN = 10;

	const NUMERIC = new Set([
		'decimal',
		'tinyint',
		'smallint',
		'int',
		'float',
		'double',
		'bigint',
		'year',
		'bit'
	]);

	let scrollTop = $state(0);
	let viewportHeight = $state(0);

	let rowHeight = $derived(settings.rowHeight);
	let first = $derived(Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN));
	let visible = $derived(Math.ceil(viewportHeight / rowHeight) + OVERSCAN * 2);
	let slice = $derived(resultset.rows.slice(first, first + visible));

	function display(cell: unknown): string {
		if (cell === null) return 'NULL';
		if (typeof cell === 'object') return JSON.stringify(cell);
		return String(cell);
	}
</script>

<div
	bind:clientHeight={viewportHeight}
	onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
	class="h-full overflow-auto"
	style="background: var(--nb-grid)"
>
	<table class="w-full border-separate border-spacing-0 text-left">
		<thead class="sticky top-0 z-10">
			<tr>
				<th
					class="w-11 border-b border-line px-2.5 text-right text-[11.5px] font-medium text-ink-muted"
					style="background: var(--nb-grid)"
					aria-label="#"
				></th>
				{#each resultset.columns as column (column.name)}
					<th
						class="border-b border-line px-2.5 py-1.5 text-[11.5px] font-medium whitespace-nowrap
						       text-ink-muted {NUMERIC.has(column.type) ? 'text-right' : ''}"
						style="background: var(--nb-grid)"
						title="{column.name} · {column.type}"
					>
						{column.name}
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			<!-- spacers keep the scrollbar honest while only ~a screen of rows exists -->
			<tr style="height: {first * rowHeight}px">
				<td colspan={resultset.columns.length + 1}></td>
			</tr>
			{#each slice as row, i (first + i)}
				<tr class="hover:bg-hover" style="height: {rowHeight}px">
					<td
						class="border-b border-line-faint px-2.5 text-right font-mono text-[12.5px] text-ink-faint"
					>
						{first + i + 1}
					</td>
					{#each row as cell, c (c)}
						<td
							class="max-w-md truncate border-b border-line-faint px-2.5 font-mono text-[12.5px]
							       whitespace-nowrap
							       {NUMERIC.has(resultset.columns[c]?.type ?? '')
								? 'text-right tabular-nums'
								: ''}
							       {cell === null ? 'text-ink-faint italic' : ''}"
							title={display(cell)}
						>
							{display(cell)}
						</td>
					{/each}
				</tr>
			{/each}
			<tr
				style="height: {Math.max(0, (resultset.rows.length - first - slice.length) * rowHeight)}px"
			>
				<td colspan={resultset.columns.length + 1}></td>
			</tr>
		</tbody>
	</table>
</div>
