/**
 * Parses StarRocks `get_query_profile()` text into a plan DAG with actual
 * execution metrics. Two useful structures live in the text (verified against
 * 3.5.x output):
 *
 *  - A `Topology:` line inside Summary — JSON of the executed plan tree keyed
 *    by plan node id. This is authoritative (no re-EXPLAIN needed, ids always
 *    match the metrics).
 *  - Operator blocks `NAME (plan_node_id=N):` with `- Metric: value` lines.
 *    Several operators share one plan node id (sink/source/prepare splits);
 *    times are summed per node, output rows take the max.
 */

export interface ProfileNode {
	id: number;
	name: string;
	children: number[];
	timeNs: number;
	/** Share of QueryCumulativeOperatorTime, 0..1. */
	timePct: number;
	rows: number | null;
}

export interface ParsedProfile {
	nodes: ProfileNode[];
	edges: { from: number; to: number }[];
	summary: {
		totalMs: number | null;
		cpuMs: number | null;
		wallMs: number | null;
		operatorMs: number | null;
		peakMemory: string | null;
	};
}

const DURATION_RE = /(\d+(?:\.\d+)?)(ns|us|ms|s|m|h)/g;
const UNIT_NS: Record<string, number> = {
	ns: 1,
	us: 1e3,
	ms: 1e6,
	s: 1e9,
	m: 60e9,
	h: 3600e9
};

/** "1s974ms" | "60.380us" | "0ns" → nanoseconds; null when not a duration. */
export function parseDuration(text: string): number | null {
	let total = 0;
	let matched = false;
	for (const [, num, unit] of text.trim().matchAll(DURATION_RE)) {
		total += Number(num) * UNIT_NS[unit];
		matched = true;
	}
	return matched ? total : null;
}

/** "5" | "1.234K (1234)" | "2.5M" → number; prefers the exact parenthesized value. */
export function parseCount(text: string): number | null {
	const exact = /\((\d+)\)\s*$/.exec(text.trim());
	if (exact) return Number(exact[1]);
	const scaled = /^(\d+(?:\.\d+)?)\s*([KMB])?$/.exec(text.trim());
	if (!scaled) return null;
	const mult = { K: 1e3, M: 1e6, B: 1e9 }[scaled[2] as 'K' | 'M' | 'B'] ?? 1;
	return Number(scaled[1]) * mult;
}

interface TopologyJson {
	rootId: number;
	nodes: { id: number; name: string; children?: number[] }[];
}

export function parseProfile(raw: string): ParsedProfile | null {
	const lines = raw.split('\n');

	// --- topology ---
	const topologyLine = lines.find((line) => line.trimStart().startsWith('- Topology:'));
	if (!topologyLine) return null;
	let topology: TopologyJson;
	try {
		topology = JSON.parse(topologyLine.slice(topologyLine.indexOf('{'))) as TopologyJson;
	} catch {
		return null;
	}

	// --- per-plan-node metrics from operator blocks ---
	const timeByNode = new Map<number, number>();
	const rowsByNode = new Map<number, number>();
	let currentNodeId: number | null = null;

	for (const line of lines) {
		const header = /^\s*[A-Z][A-Z0-9_]+ \(plan_node_id=(-?\d+)\)/.exec(line);
		if (header) {
			currentNodeId = Number(header[1]);
			continue;
		}
		// A new non-operator section (Fragment N:, Pipeline...) ends the block.
		if (/^\s*(Fragment \d+|Pipeline)/.test(line)) {
			currentNodeId = null;
			continue;
		}
		if (currentNodeId === null) continue;

		const metric = /^\s*- ([A-Za-z_][A-Za-z0-9_]*): (.+)$/.exec(line);
		if (!metric) continue;
		const [, name, value] = metric;
		if (name.startsWith('__')) continue; // __MAX_OF_/__MIN_OF_ instance spread

		if (name === 'OperatorTotalTime') {
			const ns = parseDuration(value);
			if (ns !== null) {
				timeByNode.set(currentNodeId, (timeByNode.get(currentNodeId) ?? 0) + ns);
			}
		} else if (name === 'PullRowNum') {
			const count = parseCount(value);
			if (count !== null) {
				rowsByNode.set(currentNodeId, Math.max(rowsByNode.get(currentNodeId) ?? 0, count));
			}
		}
	}

	// --- summary ---
	const summaryValue = (label: string): string | null => {
		const line = lines.find((l) => l.trimStart().startsWith(`- ${label}:`));
		return line ? line.slice(line.indexOf(':') + 1).trim() : null;
	};
	const durationMs = (label: string): number | null => {
		const value = summaryValue(label);
		const ns = value ? parseDuration(value) : null;
		return ns === null ? null : ns / 1e6;
	};

	const operatorMs = durationMs('QueryCumulativeOperatorTime');
	const totalOperatorNs = (operatorMs ?? 0) * 1e6;

	const nodes: ProfileNode[] = topology.nodes.map((node) => {
		const timeNs = timeByNode.get(node.id) ?? 0;
		return {
			id: node.id,
			name: node.name,
			children: node.children ?? [],
			timeNs,
			timePct: totalOperatorNs > 0 ? timeNs / totalOperatorNs : 0,
			rows: rowsByNode.get(node.id) ?? null
		};
	});

	const edges = nodes.flatMap((node) =>
		node.children.map((child) => ({ from: child, to: node.id }))
	);

	return {
		nodes,
		edges,
		summary: {
			totalMs: durationMs('Total'),
			cpuMs: durationMs('QueryCumulativeCpuTime'),
			wallMs: durationMs('QueryExecutionWallTime'),
			operatorMs,
			peakMemory: summaryValue('QueryPeakMemoryUsagePerNode')
		}
	};
}
