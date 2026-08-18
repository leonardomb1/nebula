<script lang="ts">
	import { onMount } from 'svelte';
	import { m } from '$lib/paraglide/messages';
	import LineChart from './LineChart.svelte';

	/** Sequential ember ramp for the ordered latency quantiles (light→dark).
	 *  Tokens, not literals, so both themes stay legible on their own ground. */
	const LATENCY_COLORS = {
		p50: 'var(--nb-chart-1)',
		p95: 'var(--nb-chart-2)',
		p99: 'var(--nb-chart-3)'
	};
	const ACCENT = 'var(--nb-chart-accent)';

	const POLL_MS = 2000;
	const WINDOW = 150;

	interface Snapshot {
		ts: number;
		queryTotal: number;
		queryErr: number;
		connections: number;
		latencyMs: { p50: number; p95: number; p99: number };
		heap: { used: number; max: number };
		beMemBytes: number;
		scanBytes: number;
	}

	let history = $state<Snapshot[]>([]);
	let qpsHistory = $state<(number | null)[]>([]);
	let processlist = $state<Record<string, unknown>[]>([]);
	let currentQueries = $state<Record<string, unknown>[]>([]);
	let unavailable = $state(false);

	let latest = $derived(history.at(-1) ?? null);
	let times = $derived(history.map((s) => s.ts));

	async function poll(): Promise<void> {
		const [metricsRes, activityRes] = await Promise.all([
			fetch('/api/metrics').catch(() => null),
			fetch('/api/activity').catch(() => null)
		]);

		if (metricsRes?.ok) {
			unavailable = false;
			const snapshot = (await metricsRes.json()) as Snapshot;
			const prev = history.at(-1);
			// query_total is cumulative — derive QPS from the delta.
			qpsHistory.push(
				prev
					? Math.max(0, (snapshot.queryTotal - prev.queryTotal) / ((snapshot.ts - prev.ts) / 1000))
					: null
			);
			history.push(snapshot);
			if (history.length > WINDOW) {
				history.shift();
				qpsHistory.shift();
			}
		} else {
			unavailable = true;
		}

		if (activityRes?.ok) {
			const activity = (await activityRes.json()) as {
				processlist: Record<string, unknown>[];
				currentQueries: Record<string, unknown>[];
			};
			processlist = activity.processlist;
			currentQueries = activity.currentQueries;
		}
	}

	onMount(() => {
		void poll();
		const timer = setInterval(poll, POLL_MS);
		return () => clearInterval(timer);
	});

	async function kill(queryId: string): Promise<void> {
		await fetch('/api/activity/kill', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ queryId })
		}).catch(() => null);
		void poll();
	}

	function bytes(n: number): string {
		if (n >= 1 << 30) return (n / (1 << 30)).toFixed(1) + ' GiB';
		if (n >= 1 << 20) return (n / (1 << 20)).toFixed(1) + ' MiB';
		if (n >= 1 << 10) return (n / (1 << 10)).toFixed(1) + ' KiB';
		return n + ' B';
	}

	const str = (row: Record<string, unknown>, key: string) => String(row[key] ?? '');

	// PROCESSLIST has no QueryId on some builds — join on ConnectionId ↔ Id.
	let mergedQueries = $derived(
		currentQueries.map((query) => {
			const process = processlist.find((row) => str(row, 'Id') === str(query, 'ConnectionId'));
			return { ...query, Info: process ? str(process, 'Info') : '' };
		})
	);
</script>

<div class="h-full overflow-auto p-3.5">
	{#if unavailable}
		<p
			class="mb-4 rounded-[10px] border px-4 py-2 text-[12.5px]"
			style="border-color: var(--nb-err); background: var(--nb-accent-wash); color: var(--nb-err)"
		>
			{m.monitor_unavailable()}
		</p>
	{/if}

	<!-- stat tiles -->
	<div class="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
		{#snippet tile(label: string, value: string)}
			<div class="nb-glass p-3.5">
				<p class="text-[11.5px] text-ink-muted">{label}</p>
				<p class="mt-1 font-mono text-2xl font-semibold">{value}</p>
			</div>
		{/snippet}
		{@render tile(m.stat_qps(), (qpsHistory.at(-1) ?? 0)?.toFixed(1) ?? '—')}
		{@render tile(m.stat_connections(), String(latest?.connections ?? '—'))}
		{@render tile(m.stat_p95(), latest ? `${latest.latencyMs.p95} ms` : '—')}
		{@render tile(
			m.stat_heap(),
			latest?.heap.max ? `${Math.round((latest.heap.used / latest.heap.max) * 100)}%` : '—'
		)}
	</div>

	<!-- charts -->
	<div class="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
		<LineChart
			title={m.chart_qps()}
			times={times}
			series={[{ label: 'qps', color: ACCENT, values: qpsHistory }]}
			format={(v) => v.toFixed(1)}
		/>
		<LineChart
			title={m.chart_latency()}
			times={times}
			series={[
				{ label: 'p50', color: LATENCY_COLORS.p50, values: history.map((s) => s.latencyMs.p50) },
				{ label: 'p95', color: LATENCY_COLORS.p95, values: history.map((s) => s.latencyMs.p95) },
				{ label: 'p99', color: LATENCY_COLORS.p99, values: history.map((s) => s.latencyMs.p99) }
			]}
			format={(v) => `${Math.round(v)} ms`}
		/>
		<LineChart
			title={m.chart_connections()}
			times={times}
			series={[{ label: 'conn', color: ACCENT, values: history.map((s) => s.connections) }]}
			format={(v) => String(Math.round(v))}
		/>
		<LineChart
			title={m.chart_be_mem()}
			times={times}
			series={[{ label: 'mem', color: ACCENT, values: history.map((s) => s.beMemBytes) }]}
			format={bytes}
		/>
	</div>

	<!-- running queries -->
	<h2 class="mb-2 text-sm font-extrabold">{m.running_queries()}</h2>
	<div class="nb-glass mb-4 overflow-x-auto">
		<table class="w-full text-left font-mono text-[11.5px]">
			<thead>
				<tr>
					{#each [m.col_query_id(), m.col_user(), m.col_exec_time(), m.col_memory(), m.col_cpu(), m.col_scan(), m.col_sql(), ''] as header, i (i)}
						<th class="border-b border-line px-3 py-2 font-sans text-[11px] font-medium whitespace-nowrap text-ink-muted">{header}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if mergedQueries.length === 0}
					<tr><td colspan="8" class="px-3 py-3 font-sans text-ink-muted italic">{m.no_running_queries()}</td></tr>
				{/if}
				{#each mergedQueries as query (str(query, 'QueryId'))}
					<tr class="border-b border-line-faint hover:bg-hover">
						<td class="px-3 py-1.5 whitespace-nowrap" title={str(query, 'QueryId')}>
							{str(query, 'QueryId').slice(0, 8)}…
						</td>
						<td class="px-3 py-1.5">{str(query, 'User')}</td>
						<td class="px-3 py-1.5 whitespace-nowrap">{str(query, 'ExecTime')}</td>
						<td class="px-3 py-1.5 whitespace-nowrap">{str(query, 'MemoryUsage')}</td>
						<td class="px-3 py-1.5 whitespace-nowrap">{str(query, 'CPUTime')}</td>
						<td class="px-3 py-1.5 whitespace-nowrap">{str(query, 'ScanBytes')}</td>
						<td class="max-w-md truncate px-3 py-1.5" title={str(query, 'Info')}>
							{str(query, 'Info')}
						</td>
						<td class="px-3 py-1.5">
							<button
								class="rounded-lg border px-2 py-0.5 font-sans text-[11px] transition-colors
								       hover:bg-hover"
								style="border-color: var(--nb-err); color: var(--nb-err)"
								onclick={() => kill(str(query, 'QueryId'))}
							>
								{m.kill()}
							</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- sessions -->
	<h2 class="mb-2 text-sm font-extrabold">{m.sessions()}</h2>
	<div class="nb-glass overflow-x-auto">
		<table class="w-full text-left font-mono text-[11.5px]">
			<thead>
				<tr>
					{#each [m.col_id(), m.col_user(), m.col_host(), m.col_db(), m.col_command(), m.col_time(), m.col_state(), m.col_sql()] as header, i (i)}
						<th class="border-b border-line px-3 py-2 font-sans text-[11px] font-medium whitespace-nowrap text-ink-muted">{header}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each processlist as row, i (i)}
					<tr class="border-b border-line-faint hover:bg-hover">
						<td class="px-3 py-1.5">{str(row, 'Id')}</td>
						<td class="px-3 py-1.5">{str(row, 'User')}</td>
						<td class="px-3 py-1.5 whitespace-nowrap">{str(row, 'Host')}</td>
						<td class="px-3 py-1.5">{str(row, 'Db')}</td>
						<td class="px-3 py-1.5">{str(row, 'Command')}</td>
						<td class="px-3 py-1.5">{str(row, 'Time')}</td>
						<td class="px-3 py-1.5">{str(row, 'State')}</td>
						<td class="max-w-md truncate px-3 py-1.5" title={str(row, 'Info')}>{str(row, 'Info')}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
