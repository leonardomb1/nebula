<script lang="ts">
	import dagre from '@dagrejs/dagre';
	import { m } from '$lib/paraglide/messages';

	interface PlanNode {
		id: number;
		type: string;
		fragment: number;
		detail: string[];
		cardinality: number | null;
		subtitle: string | null;
		actualRows?: number | null;
		timeMs?: number;
		timePct?: number;
	}
	interface PlanEdge {
		from: number;
		to: number;
		kind: 'local' | 'exchange';
	}
	interface ProfileSummary {
		totalMs: number | null;
		cpuMs: number | null;
		wallMs: number | null;
		operatorMs: number | null;
		peakMemory: string | null;
	}

	let {
		nodes,
		edges,
		summary = null
	}: { nodes: PlanNode[]; edges: PlanEdge[]; summary?: ProfileSummary | null } = $props();

	/** Heat: red for hot operators (>30% of operator time), amber for warm. */
	function strokeFor(node: PlanNode, isSelected: boolean): string {
		if (isSelected) return 'var(--nebula-primary)';
		if ((node.timePct ?? 0) > 0.3) return 'var(--nebula-err)';
		if ((node.timePct ?? 0) > 0.15) return 'var(--nebula-warn)';
		return 'var(--nebula-border)';
	}

	const NODE_W = 190;
	const NODE_H = 54;

	let selected = $state<PlanNode | null>(null);
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);

	let layout = $derived.by(() => {
		const g = new dagre.graphlib.Graph();
		// BT: data flows upward — scans at the bottom, RESULT on top.
		g.setGraph({ rankdir: 'BT', nodesep: 28, ranksep: 44, marginx: 20, marginy: 20 });
		g.setDefaultEdgeLabel(() => ({}));
		for (const node of nodes) g.setNode(String(node.id), { width: NODE_W, height: NODE_H });
		for (const edge of edges) g.setEdge(String(edge.from), String(edge.to));
		dagre.layout(g);

		return {
			width: g.graph().width ?? 0,
			height: g.graph().height ?? 0,
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

	function compact(n: number): string {
		return Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
	}

	function onWheel(event: WheelEvent): void {
		event.preventDefault();
		zoom = Math.min(2.5, Math.max(0.25, zoom * (event.deltaY < 0 ? 1.12 : 0.9)));
	}

	let dragging = false;
	let lastX = 0;
	let lastY = 0;
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

<div class="flex h-full min-h-0 flex-col">
	{#if summary}
		<div class="flex gap-4 border-b border-edge bg-surface px-3 py-1.5 font-mono text-xs text-ink-muted">
			{#if summary.totalMs !== null}<span>{m.profile_total()}: <span class="text-ink">{summary.totalMs} ms</span></span>{/if}
			{#if summary.cpuMs !== null}<span>CPU: <span class="text-ink">{summary.cpuMs.toFixed(0)} ms</span></span>{/if}
			{#if summary.wallMs !== null}<span>{m.profile_wall()}: <span class="text-ink">{summary.wallMs.toFixed(0)} ms</span></span>{/if}
			{#if summary.peakMemory}<span>{m.profile_peak_mem()}: <span class="text-ink">{summary.peakMemory}</span></span>{/if}
		</div>
	{/if}
	<div class="flex min-h-0 flex-1">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="min-w-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing"
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
						stroke={path.kind === 'exchange' ? 'var(--nebula-secondary)' : 'var(--nebula-border)'}
						stroke-width="1.5"
						stroke-dasharray={path.kind === 'exchange' ? '5 4' : 'none'}
					/>
				{/each}
				{#each nodes as node (node.id)}
					{@const pos = layout.positions.get(node.id)}
					{#if pos}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<g
							transform="translate({pos.x - NODE_W / 2},{pos.y - NODE_H / 2})"
							onclick={() => (selected = node)}
							class="cursor-pointer"
						>
							<rect
								width={NODE_W}
								height={NODE_H}
								rx="6"
								fill="var(--nebula-surface-2)"
								stroke={strokeFor(node, selected?.id === node.id)}
								stroke-width={selected?.id === node.id || (node.timePct ?? 0) > 0.15 ? 2 : 1}
							/>
							<text x="10" y="20" fill="var(--nebula-text)" font-size="12" font-weight="600">
								{node.id >= 0 ? `${node.id}: ` : ''}{node.type.slice(0, 24)}
							</text>
							<text x="10" y="36" fill="var(--nebula-text-muted)" font-size="10">
								{(node.subtitle ?? '').slice(0, 30)}
							</text>
							{#if node.timeMs !== undefined}
								<text x="10" y="48" fill="var(--nebula-text-muted)" font-size="10">
									{node.actualRows !== null && node.actualRows !== undefined
										? `${compact(node.actualRows)} ${m.plan_rows()} · `
										: ''}{node.timeMs.toFixed(1)} ms ({Math.round((node.timePct ?? 0) * 100)}%)
								</text>
							{:else if node.cardinality !== null}
								<text x="10" y="48" fill="var(--nebula-secondary)" font-size="10">
									~{compact(node.cardinality)} {m.plan_rows()}
								</text>
							{/if}
						</g>
					{/if}
				{/each}
			</g>
		</svg>
	</div>

	{#if selected}
		<aside class="w-80 shrink-0 overflow-auto border-l border-edge bg-surface p-3">
			<div class="mb-2 flex items-center justify-between">
				<h3 class="font-mono text-sm font-semibold">
					{selected.id >= 0 ? `${selected.id}: ` : ''}{selected.type}
				</h3>
				<button class="text-ink-muted hover:text-ink" onclick={() => (selected = null)}>✕</button>
			</div>
			<p class="mb-2 text-xs text-ink-muted">{m.plan_fragment({ n: selected.fragment })}</p>
			<pre class="font-mono text-xs leading-5 whitespace-pre-wrap">{selected.detail.join('\n')}</pre>
		</aside>
	{/if}
	</div>
</div>
