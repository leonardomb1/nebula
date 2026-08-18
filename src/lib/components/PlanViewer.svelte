<script lang="ts">
	import dagre from '@dagrejs/dagre';
	import { m } from '$lib/paraglide/messages';
	import type { PlanEdge, PlanNode, ProfileSummary } from '$lib/workbench.svelte';

	let {
		nodes,
		edges,
		summary = null,
		raw = null
	}: {
		nodes: PlanNode[];
		edges: PlanEdge[];
		summary?: ProfileSummary | null;
		raw?: string | null;
	} = $props();

	/** Above this share of operator time an operator reads as the bottleneck. */
	const HOT = 0.3;
	const WARM = 0.15;

	let view = $state<'tree' | 'graph'>('tree');
	let selectedId = $state<number | null>(null);
	let copied = $state(false);

	/* ---------------------------------------------------------------- tree */

	interface Row {
		node: PlanNode;
		depth: number;
	}

	// Edges run producer → consumer, so a plan root is a node that never
	// produces for anyone; children hang off `to`, deepest ids first, which is
	// the order StarRocks itself prints them in.
	let rows = $derived.by(() => {
		const producers = new Set(edges.map((edge) => edge.from));
		const childrenOf = new Map<number, number[]>();
		for (const edge of edges) {
			childrenOf.set(edge.to, [...(childrenOf.get(edge.to) ?? []), edge.from]);
		}
		const byId = new Map(nodes.map((node) => [node.id, node]));
		const seen = new Set<number>();
		const out: Row[] = [];

		const walk = (id: number, depth: number) => {
			const node = byId.get(id);
			if (!node || seen.has(id)) return;
			seen.add(id);
			out.push({ node, depth });
			for (const child of (childrenOf.get(id) ?? []).sort((a, b) => b - a)) {
				walk(child, depth + 1);
			}
		};

		for (const node of nodes.filter((n) => !producers.has(n.id)).sort((a, b) => a.id - b.id)) {
			walk(node.id, 0);
		}
		// Anything the edge list missed still deserves a line.
		for (const node of nodes) walk(node.id, 0);
		return out;
	});

	let profiled = $derived(nodes.some((node) => node.timeMs !== undefined));
	let hottest = $derived(
		profiled
			? nodes.reduce((worst, node) => ((node.timePct ?? 0) > (worst.timePct ?? 0) ? node : worst))
			: null
	);
	let fragments = $derived(new Set(nodes.map((node) => node.fragment)).size);
	let selected = $derived(nodes.find((node) => node.id === selectedId) ?? null);

	/** Detail lines are `key: value` far more often than not — split them so
	 *  the inspector can align them into a table like the rest of the UI. */
	let pairs = $derived(
		(selected?.detail ?? []).map((line) => {
			const match = /^([^:]{1,40}):\s*(.+)$/.exec(line);
			return match ? { k: match[1], v: match[2] } : { k: line, v: '' };
		})
	);

	function heat(node: PlanNode): 'hot' | 'warm' | 'cool' {
		const pct = node.timePct ?? 0;
		return pct > HOT ? 'hot' : pct > WARM ? 'warm' : 'cool';
	}

	function compact(n: number): string {
		return Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
	}

	async function copyPlan(): Promise<void> {
		if (!raw) return;
		await navigator.clipboard.writeText(raw).catch(() => null);
		copied = true;
		setTimeout(() => (copied = false), 1400);
	}

	/* --------------------------------------------------------------- graph */

	const NODE_W = 190;
	const NODE_H = 54;

	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let dragging = false;
	let lastX = 0;
	let lastY = 0;

	let layout = $derived.by(() => {
		const g = new dagre.graphlib.Graph();
		// BT: data flows upward — scans at the bottom, RESULT on top.
		g.setGraph({ rankdir: 'BT', nodesep: 28, ranksep: 44, marginx: 20, marginy: 20 });
		g.setDefaultEdgeLabel(() => ({}));
		for (const node of nodes) g.setNode(String(node.id), { width: NODE_W, height: NODE_H });
		for (const edge of edges) g.setEdge(String(edge.from), String(edge.to));
		dagre.layout(g);

		return {
			positions: new Map(nodes.map((node) => [node.id, g.node(String(node.id))])),
			paths: edges.map((edge) => {
				const points = g.edge(String(edge.from), String(edge.to))?.points ?? [];
				return {
					kind: edge.kind,
					d: points
						.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
						.join(' ')
				};
			})
		};
	});

	function onWheel(event: WheelEvent): void {
		event.preventDefault();
		zoom = Math.min(2.5, Math.max(0.25, zoom * (event.deltaY < 0 ? 1.12 : 0.9)));
	}
	function onPointerDown(event: PointerEvent): void {
		dragging = true;
		lastX = event.clientX;
		lastY = event.clientY;
	}
	function onPointerMove(event: PointerEvent): void {
		if (!dragging) return;
		panX += event.clientX - lastX;
		panY += event.clientY - lastY;
		lastX = event.clientX;
		lastY = event.clientY;
	}
</script>

<div class="flex h-full min-h-0">
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- summary strip -->
		<div class="flex flex-wrap items-center gap-4 px-3.5 pt-2.5 pb-2">
			{#snippet stat(value: string, label: string)}
				<div class="shrink-0">
					<span class="font-mono text-[13px] font-semibold">{value}</span>
					<span class="ml-1.5 text-[10.5px] text-ink-muted">{label}</span>
				</div>
			{/snippet}

			{#if summary?.totalMs != null}
				{@render stat(`${summary.totalMs} ms`, m.profile_total())}
			{/if}
			{#if summary?.cpuMs != null}
				{@render stat(`${summary.cpuMs.toFixed(0)} ms`, 'CPU')}
			{/if}
			{#if summary?.wallMs != null}
				{@render stat(`${summary.wallMs.toFixed(0)} ms`, m.profile_wall())}
			{/if}
			{#if summary?.peakMemory}
				{@render stat(summary.peakMemory, m.profile_peak_mem())}
			{/if}
			{@render stat(String(nodes.length), m.plan_operator())}
			{@render stat(String(fragments), m.plan_fragment({ n: fragments }))}

			<div class="ml-auto flex items-center gap-2">
				{#if hottest && (hottest.timePct ?? 0) > HOT}
					<button
						class="flex h-6 shrink-0 items-center rounded-full px-2.5 text-[11px] font-medium"
						style="background: var(--nb-accent-wash); color: var(--nb-accent-soft)"
						onclick={() => (selectedId = hottest.id)}
					>
						{m.plan_bottleneck({ id: hottest.id })}
					</button>
				{/if}
				<div class="flex overflow-hidden rounded-[9px] border border-line">
					{#each [['tree', m.plan_view_tree()], ['graph', m.plan_view_graph()]] as const as [id, label] (id)}
						<button
							class="h-6 px-2.5 text-[11px] transition-colors
							       {view === id ? 'bg-active font-semibold' : 'text-ink-muted hover:bg-hover'}"
							onclick={() => (view = id)}>{label}</button
						>
					{/each}
				</div>
			</div>
		</div>

		{#if view === 'tree'}
			<div
				class="flex items-center px-3.5 pb-1.5 text-[10px] font-medium tracking-[0.1em]
				       text-ink-muted uppercase"
			>
				<span class="flex-1">{m.plan_operator()}</span>
				<span class="w-[86px] text-right">{m.plan_est_rows()}</span>
				<span class="w-[112px] text-right">{profiled ? m.plan_cost() : m.plan_time()}</span>
			</div>
			<div class="min-h-0 flex-1 overflow-auto px-2.5 pb-2.5">
				{#each rows as { node, depth } (node.id)}
					{@const level = heat(node)}
					<button
						class="flex h-[38px] w-full items-center gap-2.5 rounded-[10px] border pr-2.5
						       text-left transition-colors
						       {selectedId === node.id
							? 'bg-active'
							: 'border-transparent hover:bg-hover'}"
						style={selectedId === node.id
							? 'border-color: color-mix(in srgb, var(--nb-accent) 45%, transparent)'
							: ''}
						onclick={() => (selectedId = node.id)}
					>
						<div
							class="flex min-w-0 flex-1 items-center gap-[9px]"
							style="padding-left: {10 + depth * 16}px"
						>
							<span class="w-6 shrink-0 font-mono text-[9.5px] text-ink-faint">
								{m.plan_fragment_short({ n: node.fragment })}
							</span>
							<span
								class="h-[5px] w-[5px] shrink-0 rounded-full"
								style="background: {level === 'cool'
									? 'var(--nb-ink-faint)'
									: 'var(--nb-accent)'}"
							></span>
							<span class="min-w-0">
								<span
									class="block truncate text-[12.5px] font-semibold"
									style={level === 'hot' ? 'color: var(--nb-accent-soft)' : ''}
								>
									{node.id >= 0 ? `${node.id} ` : ''}{node.type}
								</span>
								{#if node.subtitle}
									<span class="block truncate font-mono text-[10.5px] text-ink-muted">
										{node.subtitle}
									</span>
								{/if}
							</span>
						</div>

						<span class="w-[86px] shrink-0 text-right font-mono text-[11.5px]">
							{node.cardinality !== null ? compact(node.cardinality) : '—'}
						</span>

						<span class="flex w-[112px] shrink-0 items-center justify-end gap-2">
							{#if node.timePct !== undefined}
								<span class="h-[6px] w-[62px] overflow-hidden rounded-full bg-line">
									<span
										class="block h-full rounded-full"
										style="width: {Math.max(2, Math.round(node.timePct * 100))}%;
										       background: {level === 'cool'
											? 'var(--nb-ink-faint)'
											: 'var(--nb-accent)'}"
									></span>
								</span>
								<span class="w-8 text-right font-mono text-[10.5px] text-ink-muted">
									{Math.round(node.timePct * 100)}%
								</span>
							{:else}
								<span class="w-8 text-right font-mono text-[10.5px] text-ink-faint">—</span>
							{/if}
						</span>
					</button>
				{/each}
			</div>
		{:else}
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
				onwheel={onWheel}
				onpointerdown={onPointerDown}
				onpointermove={onPointerMove}
				onpointerup={() => (dragging = false)}
				onpointerleave={() => (dragging = false)}
			>
				<svg width="100%" height="100%">
					<g transform="translate({panX},{panY}) scale({zoom})">
						{#each layout.paths as path, i (i)}
							<path
								d={path.d}
								fill="none"
								stroke="var(--nb-line)"
								stroke-width="1.5"
								stroke-dasharray={path.kind === 'exchange' ? '5 4' : 'none'}
							/>
						{/each}
						{#each nodes as node (node.id)}
							{@const pos = layout.positions.get(node.id)}
							{@const level = heat(node)}
							{#if pos}
								<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
								<g
									transform="translate({pos.x - NODE_W / 2},{pos.y - NODE_H / 2})"
									onclick={() => (selectedId = node.id)}
									class="cursor-pointer"
								>
									<rect
										width={NODE_W}
										height={NODE_H}
										rx="10"
										fill="var(--nb-glass-2)"
										stroke={selectedId === node.id || level !== 'cool'
											? 'var(--nb-accent)'
											: 'var(--nb-line)'}
										stroke-width={selectedId === node.id || level === 'hot' ? 2 : 1}
									/>
									<text x="12" y="21" fill="var(--nb-ink)" font-size="12" font-weight="600">
										{node.id >= 0 ? `${node.id}: ` : ''}{node.type.slice(0, 24)}
									</text>
									<text x="12" y="36" fill="var(--nb-ink-muted)" font-size="10">
										{(node.subtitle ?? '').slice(0, 30)}
									</text>
									{#if node.timeMs !== undefined}
										<text x="12" y="48" fill="var(--nb-ink-muted)" font-size="10">
											{node.timeMs.toFixed(1)} ms ({Math.round((node.timePct ?? 0) * 100)}%)
										</text>
									{:else if node.cardinality !== null}
										<text x="12" y="48" fill="var(--nb-ink-muted)" font-size="10">
											~{compact(node.cardinality)}
											{m.plan_rows()}
										</text>
									{/if}
								</g>
							{/if}
						{/each}
					</g>
				</svg>
			</div>
		{/if}
	</div>

	<!-- inspector -->
	<aside
		class="nb-glass m-2.5 ml-0 flex w-[300px] shrink-0 flex-col overflow-hidden"
		aria-label={m.plan_tab()}
	>
		{#if selected}
			<h3 class="shrink-0 px-3.5 pt-3 pb-2 text-[13.5px] font-extrabold">
				{selected.id >= 0 ? `${selected.id} · ` : ''}{selected.type}
			</h3>
			<div class="flex shrink-0 flex-wrap gap-1.5 px-3.5">
				<span
					class="inline-flex h-[22px] items-center rounded-full px-2.5 text-[10.5px] font-medium"
					style="background: var(--nb-hover); color: var(--nb-ink-muted)"
				>
					{m.plan_fragment({ n: selected.fragment })}
				</span>
				{#if heat(selected) === 'hot'}
					<span
						class="inline-flex h-[22px] items-center rounded-full px-2.5 text-[10.5px] font-medium"
						style="background: var(--nb-accent-wash); color: var(--nb-accent-soft)"
					>
						{m.plan_bottleneck({ id: selected.id })}
					</span>
				{/if}
			</div>
			<div class="flex min-h-0 flex-1 flex-col overflow-auto px-3.5 pt-2.5">
				{#snippet pair(k: string, v: string)}
					<div class="flex items-baseline gap-2.5 border-b border-line-faint py-[5px]">
						<span class="shrink-0 text-[11.5px] text-ink-muted">{k}</span>
						<span class="flex-1 text-right font-mono text-[11.5px] break-all">{v}</span>
					</div>
				{/snippet}

				{#if selected.cardinality !== null}
					{@render pair(m.plan_est_rows(), selected.cardinality.toLocaleString())}
				{/if}
				{#if selected.actualRows != null}
					{@render pair(m.plan_actual_rows(), selected.actualRows.toLocaleString())}
				{/if}
				{#if selected.timeMs !== undefined}
					{@render pair(m.plan_time(), `${selected.timeMs.toFixed(1)} ms`)}
					{@render pair(m.plan_cost(), `${Math.round((selected.timePct ?? 0) * 100)}%`)}
				{/if}
				{#each pairs as p, i (i)}
					{#if p.v}
						{@render pair(p.k, p.v)}
					{:else}
						<p class="border-b border-line-faint py-[5px] font-mono text-[11.5px] break-all">
							{p.k}
						</p>
					{/if}
				{/each}
			</div>
			{#if raw}
				<div class="flex shrink-0 gap-2 px-3.5 py-3">
					<button
						class="flex h-7 items-center rounded-[9px] border border-line px-2.5 text-[11.5px]
						       font-medium transition-colors hover:bg-hover"
						onclick={copyPlan}
					>
						{copied ? m.copied() : m.plan_copy()}
					</button>
				</div>
			{/if}
		{:else}
			<p class="p-3.5 text-[11.5px] leading-relaxed text-ink-muted">{m.plan_pick_node()}</p>
		{/if}
	</aside>
</div>
