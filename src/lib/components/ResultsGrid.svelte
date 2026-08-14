<script lang="ts">
	import { untrack } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ResultSet } from '$lib/workbench.svelte';
	import Icon from './Icon.svelte';

	let { resultset }: { resultset: ResultSet } = $props();

	const ROW_HEIGHT = 28;
	const OVERSCAN = 10;
	const GUTTER = 52;
	const MIN_WIDTH = 64;

	let viewport = $state<HTMLDivElement | null>(null);
	let scrollTop = $state(0);
	let viewportHeight = $state(0);

	let first = $derived(Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN));
	let visible = $derived(Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2);
	let slice = $derived(resultset.rows.slice(first, first + visible));

	// --- column widths -------------------------------------------------------

	let widths = $state<number[]>([]);
	/** Columns the user dragged — never re-measured from content afterwards. */
	let pinned = new Set<number>();

	/** Rough autofit: header plus a sample of the first rows, at ~7px a char. */
	function measure(): void {
		const sample = resultset.rows.slice(0, 50);
		widths = resultset.columns.map((column, c) => {
			if (pinned.has(c) && widths[c]) return widths[c];
			let chars = column.name.length + column.type.length + 2;
			for (const row of sample) chars = Math.max(chars, display(row[c]).length);
			return Math.min(340, Math.max(96, chars * 7 + 28));
		});
	}

	let measured: ResultSet | null = null;

	$effect(() => {
		// Re-measure when the result set changes or finishes streaming; untracked
		// inside so streaming rows do not retrigger it per batch.
		resultset.columns;
		resultset.finished;
		untrack(() => {
			if (measured !== resultset) {
				measured = resultset;
				pinned = new Set();
				anchor = cursor = null;
			}
			measure();
		});
	});

	function startResize(event: PointerEvent, c: number): void {
		event.preventDefault();
		event.stopPropagation();
		const startX = event.clientX;
		const from = widths[c];

		const move = (e: PointerEvent) => {
			widths[c] = Math.max(MIN_WIDTH, from + e.clientX - startX);
		};
		const up = () => {
			pinned.add(c);
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
	}

	// --- selection -----------------------------------------------------------

	interface Cell {
		r: number;
		c: number;
	}

	let anchor = $state<Cell | null>(null);
	let cursor = $state<Cell | null>(null);
	let dragging = $state(false);
	let copied = $state(false);

	let colWidths = $derived(resultset.columns.map((_, i) => widths[i] ?? 140));

	let box = $derived(
		anchor && cursor
			? {
					r0: Math.min(anchor.r, cursor.r),
					r1: Math.max(anchor.r, cursor.r),
					c0: Math.min(anchor.c, cursor.c),
					c1: Math.max(anchor.c, cursor.c)
				}
			: null
	);

	const selected = (r: number, c: number) =>
		!!box && r >= box.r0 && r <= box.r1 && c >= box.c0 && c <= box.c1;

	const lastRow = $derived(Math.max(0, resultset.rows.length - 1));
	const lastCol = $derived(Math.max(0, resultset.columns.length - 1));

	function select(cell: Cell, extend = false): void {
		if (!extend || !anchor) anchor = cell;
		cursor = cell;
	}

	function selectColumn(c: number): void {
		anchor = { r: 0, c };
		cursor = { r: lastRow, c };
	}

	function selectRow(r: number): void {
		anchor = { r, c: 0 };
		cursor = { r, c: lastCol };
	}

	function selectAll(): void {
		anchor = { r: 0, c: 0 };
		cursor = { r: lastRow, c: lastCol };
	}

	/** Keeps the moving end of the selection on screen, both axes. */
	function reveal(cell: Cell): void {
		if (!viewport) return;
		const top = cell.r * ROW_HEIGHT;
		if (top < viewport.scrollTop) viewport.scrollTop = top;
		else if (top + ROW_HEIGHT > viewport.scrollTop + viewport.clientHeight - ROW_HEIGHT) {
			viewport.scrollTop = top + ROW_HEIGHT * 2 - viewport.clientHeight;
		}

		const left = colWidths.slice(0, cell.c).reduce((sum, w) => sum + w, 0);
		if (left < viewport.scrollLeft) viewport.scrollLeft = left;
		else if (left + colWidths[cell.c] > viewport.scrollLeft + viewport.clientWidth - GUTTER) {
			viewport.scrollLeft = left + colWidths[cell.c] + GUTTER - viewport.clientWidth;
		}
	}

	function move(dr: number, dc: number, extend: boolean): void {
		const from = cursor ?? { r: 0, c: 0 };
		const next = {
			r: Math.min(lastRow, Math.max(0, from.r + dr)),
			c: Math.min(lastCol, Math.max(0, from.c + dc))
		};
		select(next, extend);
		reveal(next);
	}

	async function copySelection(): Promise<void> {
		if (!box) return;
		const lines: string[] = [];
		for (let r = box.r0; r <= box.r1; r++) {
			const row = resultset.rows[r] ?? [];
			const cells: string[] = [];
			for (let c = box.c0; c <= box.c1; c++) cells.push(display(row[c]));
			lines.push(cells.join('\t'));
		}
		try {
			await navigator.clipboard.writeText(lines.join('\n'));
			copied = true;
			setTimeout(() => (copied = false), 1200);
		} catch {
			// clipboard denied (insecure origin) — nothing useful to say here
		}
	}

	function onKeydown(event: KeyboardEvent): void {
		const ctrl = event.ctrlKey || event.metaKey;
		if (ctrl && event.key.toLowerCase() === 'c') {
			event.preventDefault();
			void copySelection();
			return;
		}
		if (ctrl && event.key.toLowerCase() === 'a') {
			event.preventDefault();
			selectAll();
			return;
		}

		const page = Math.max(1, Math.floor(viewportHeight / ROW_HEIGHT) - 1);
		const steps: Record<string, [number, number]> = {
			ArrowUp: [-1, 0],
			ArrowDown: [1, 0],
			ArrowLeft: [0, -1],
			ArrowRight: [0, 1],
			PageUp: [-page, 0],
			PageDown: [page, 0]
		};
		if (event.key in steps) {
			event.preventDefault();
			const [dr, dc] = steps[event.key];
			move(dr, dc, event.shiftKey);
		} else if (event.key === 'Home') {
			event.preventDefault();
			move(ctrl ? -lastRow : 0, -lastCol, event.shiftKey);
		} else if (event.key === 'End') {
			event.preventDefault();
			move(ctrl ? lastRow : 0, lastCol, event.shiftKey);
		} else if (event.key === 'Escape') {
			anchor = cursor = null;
		}
	}

	// --- rendering -----------------------------------------------------------

	function display(cell: unknown): string {
		if (cell === null || cell === undefined) return 'NULL';
		if (typeof cell === 'object') return JSON.stringify(cell);
		return String(cell);
	}

	/** Column type → the badge Fabric-style grids put before the column name. */
	function kind(type: string): 'temporal' | 'number' | 'text' {
		if (/date|time|year/.test(type)) return 'temporal';
		if (/int|decimal|float|double|numeric|bit/.test(type)) return 'number';
		return 'text';
	}
</script>

<svelte:window onpointerup={() => (dragging = false)} />

<div class="relative h-full">
<div
	bind:this={viewport}
	bind:clientHeight={viewportHeight}
	onscroll={() => (scrollTop = viewport?.scrollTop ?? 0)}
	class="relative h-full overflow-auto text-[12px] select-none"
>
	<table
		role="grid"
		tabindex="0"
		aria-label={m.results()}
		aria-rowcount={resultset.rows.length}
		onkeydown={onKeydown}
		class="border-separate border-spacing-0 text-left focus:outline-none"
		style="table-layout: fixed; min-width: 100%; width: {GUTTER +
			colWidths.reduce((sum, w) => sum + w, 0)}px"
	>
		<colgroup>
			<col style="width: {GUTTER}px" />
			{#each colWidths as width, i (i)}
				<col style="width: {width}px" />
			{/each}
			<col />
		</colgroup>

		<thead class="sticky top-0 z-20">
			<tr>
				<th role="columnheader" class="sticky left-0 z-30 h-8 border-r border-b border-edge bg-surface-2 p-0">
					<button
						class="flex h-full w-full items-center justify-center text-ink-dim hover:text-ink"
						onclick={selectAll}
						aria-label="select all"
					>
						<Icon name="table" size={13} />
					</button>
				</th>
				{#each resultset.columns as column, c (c)}
					{@const type = kind(column.type)}
					<th
						role="columnheader"
						class="relative h-8 border-r border-b border-edge p-0 font-medium
							{box && box.c0 <= c && c <= box.c1 ? 'bg-surface-3' : 'bg-surface-2'}"
					>
						<button
							class="flex h-full w-full items-center gap-1.5 px-2 text-left"
							onclick={() => selectColumn(c)}
							title="{column.name} · {column.type}"
						>
							{#if type === 'temporal'}
								<Icon name="calendar" size={12} class="text-ink-dim" />
							{:else}
								<span class="font-mono text-[10px] leading-none tracking-tight text-ink-dim">
									{type === 'number' ? '123' : 'ABC'}
								</span>
							{/if}
							<span class="truncate text-ink">{column.name}</span>
						</button>
						<!-- drag the right edge to resize, like every grid ever -->
						<span
							role="separator"
							aria-orientation="vertical"
							class="absolute top-0 right-0 h-full w-1 cursor-col-resize hover:bg-primary-strong"
							onpointerdown={(e) => startResize(e, c)}
						></span>
					</th>
				{/each}
				<th role="columnheader" class="border-b border-edge bg-surface-2"></th>
			</tr>
		</thead>

		<tbody>
			<!-- spacer keeps the scrollbar honest while only ~a screen of rows exists -->
			<tr style="height: {first * ROW_HEIGHT}px"><td colspan={resultset.columns.length + 2}></td></tr>
			{#each slice as row, i (first + i)}
				{@const r = first + i}
				<tr class="group" style="height: {ROW_HEIGHT}px">
					<td class="sticky left-0 z-10 border-r border-b border-edge-soft p-0 text-right">
						<button
							class="h-full w-full px-2 text-right text-[11px] text-ink-dim group-hover:bg-surface-2
								{box && box.r0 <= r && r <= box.r1 ? 'bg-surface-3 text-ink' : 'bg-surface'}"
							onclick={() => selectRow(r)}
							tabindex="-1"
						>
							{r + 1}
						</button>
					</td>
					{#each resultset.columns as column, c (c)}
						{@const value = display(row[c])}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<td
							role="gridcell"
							aria-selected={selected(r, c)}
							title={value}
							onpointerdown={(e) => {
								dragging = true;
								select({ r, c }, e.shiftKey);
							}}
							onpointerenter={() => dragging && select({ r, c }, true)}
							class="overflow-hidden border-r border-b border-edge-soft px-2 text-ellipsis whitespace-nowrap
								{selected(r, c) ? 'bg-primary-strong/25' : 'group-hover:bg-surface-2/50'}
								{cursor?.r === r && cursor?.c === c ? 'outline outline-primary -outline-offset-1' : ''}
								{row[c] === null ? 'text-ink-dim italic' : ''}
								{kind(column.type) === 'number' ? 'font-mono tabular-nums' : ''}"
						>
							{value}
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

	{#if copied}
		<span
			class="pointer-events-none absolute bottom-3 left-3 rounded-md border border-edge bg-surface-2 px-2 py-1 text-[11px] text-ink shadow-lg"
		>
			{m.copied()}
		</span>
	{/if}
</div>
