<script lang="ts">
	/**
	 * Small time-series line chart (SVG): thin 2px lines, recessive grid,
	 * crosshair + tooltip on hover, direct labels at line ends for
	 * multi-series. Series colors are supplied by the caller — sequential ramp
	 * for ordered series (validated), single accent otherwise.
	 */
	interface Series {
		label: string;
		color: string;
		values: (number | null)[];
	}

	let {
		title,
		series,
		times,
		format = (v: number) => v.toLocaleString()
	}: {
		title: string;
		series: Series[];
		times: number[];
		format?: (v: number) => string;
	} = $props();

	const W = 420;
	const H = 140;
	const PAD = { top: 8, right: 64, bottom: 18, left: 8 };

	let hoverIndex = $state<number | null>(null);

	let max = $derived(
		Math.max(1e-9, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)))
	);

	function x(i: number): number {
		const n = Math.max(1, times.length - 1);
		return PAD.left + (i / n) * (W - PAD.left - PAD.right);
	}
	function y(v: number): number {
		return PAD.top + (1 - v / (max * 1.1)) * (H - PAD.top - PAD.bottom);
	}
	function path(values: (number | null)[]): string {
		let d = '';
		values.forEach((v, i) => {
			if (v === null) return;
			d += `${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
		});
		return d;
	}
	function timeLabel(ts: number): string {
		return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
	}

	function onMove(event: MouseEvent): void {
		const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
		const px = ((event.clientX - rect.left) / rect.width) * W;
		const n = Math.max(1, times.length - 1);
		const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * n);
		hoverIndex = Math.min(times.length - 1, Math.max(0, i));
	}
</script>

<figure class="rounded-lg border border-edge bg-surface-2/60 p-3">
	<figcaption class="mb-1 flex items-baseline justify-between text-xs">
		<span class="font-medium text-ink">{title}</span>
		{#if series.length > 1}
			<span class="flex gap-3">
				{#each series as s (s.label)}
					<span class="flex items-center gap-1 text-ink-muted">
						<span class="inline-block h-0.5 w-3 rounded" style="background: {s.color}"></span>
						{s.label}
					</span>
				{/each}
			</span>
		{/if}
	</figcaption>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<svg
		viewBox="0 0 {W} {H}"
		class="w-full"
		role="img"
		aria-label={title}
		onmousemove={onMove}
		onmouseleave={() => (hoverIndex = null)}
	>
		<!-- recessive grid: three horizontal lines -->
		{#each [0.25, 0.5, 0.75] as f (f)}
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={PAD.top + f * (H - PAD.top - PAD.bottom)}
				y2={PAD.top + f * (H - PAD.top - PAD.bottom)}
				stroke="var(--nebula-border)"
				stroke-width="0.5"
				opacity="0.6"
			/>
		{/each}

		{#each series as s (s.label)}
			<path d={path(s.values)} fill="none" stroke={s.color} stroke-width="2" />
			{@const last = s.values.findLast((v) => v !== null)}
			{#if last !== undefined && last !== null}
				<text
					x={W - PAD.right + 4}
					y={y(last) + 3}
					font-size="10"
					fill="var(--nebula-text-muted)"
				>
					{series.length > 1 ? `${s.label} ` : ''}{format(last)}
				</text>
			{/if}
		{/each}

		{#if hoverIndex !== null && times[hoverIndex] !== undefined}
			<line
				x1={x(hoverIndex)}
				x2={x(hoverIndex)}
				y1={PAD.top}
				y2={H - PAD.bottom}
				stroke="var(--nebula-text-muted)"
				stroke-width="1"
				stroke-dasharray="3 3"
			/>
			{#each series as s (s.label)}
				{@const v = s.values[hoverIndex]}
				{#if v !== null && v !== undefined}
					<circle cx={x(hoverIndex)} cy={y(v)} r="3.5" fill={s.color} stroke="var(--nebula-surface)" stroke-width="2" />
				{/if}
			{/each}
		{/if}

		<text x={PAD.left} y={H - 4} font-size="9" fill="var(--nebula-text-muted)">
			{times.length ? timeLabel(times[0]) : ''}
		</text>
		<text x={W - PAD.right} y={H - 4} font-size="9" text-anchor="end" fill="var(--nebula-text-muted)">
			{times.length ? timeLabel(times[times.length - 1]) : ''}
		</text>
	</svg>
	{#if hoverIndex !== null && times[hoverIndex] !== undefined}
		<div class="mt-1 flex gap-3 font-mono text-xs text-ink-muted">
			<span>{timeLabel(times[hoverIndex])}</span>
			{#each series as s (s.label)}
				{@const v = s.values[hoverIndex]}
				<span class="flex items-center gap-1">
					<span class="inline-block h-2 w-2 rounded-full" style="background: {s.color}"></span>
					<span class="text-ink">{v === null || v === undefined ? '—' : format(v)}</span>
				</span>
			{/each}
		</div>
	{/if}
</figure>
