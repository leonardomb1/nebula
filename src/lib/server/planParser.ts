/**
 * Parses StarRocks `EXPLAIN [VERBOSE]` text output (there is no JSON form)
 * into a DAG for the graphical plan viewer. Written against real 3.5.x
 * output — see the shape notes inline; the docs lag the actual format.
 *
 * Structure of the text:
 *   PLAN FRAGMENT 0(F03)          ← fragment header
 *     ...fragment attributes...   ← may include "OutPut Exchange Id: NN"
 *     8:MERGING-EXCHANGE          ← plan nodes, children BELOW parents
 *     |  attr lines
 *     |----2:OlapScanNode         ← branch (build/right) child
 *     1:Project                   ← same indent = continuation (probe/left) child
 *
 * Node ids are global across fragments and are the join key to query
 * profiles. A fragment's root feeds the EXCHANGE node named by its
 * "OutPut Exchange Id" in the consuming fragment.
 */

export interface PlanNode {
	id: number;
	type: string;
	fragment: number;
	/** Raw attribute lines, pipes stripped — the details panel content. */
	detail: string[];
	cardinality: number | null;
	/** Short secondary label: table, join op, distribution… */
	subtitle: string | null;
}

export interface PlanEdge {
	from: number;
	to: number;
	kind: 'local' | 'exchange';
}

export interface ParsedPlan {
	nodes: PlanNode[];
	edges: PlanEdge[];
	raw: string;
}

/** The synthetic sink node every plan flows into. */
export const RESULT_NODE_ID = -1;

const FRAGMENT_RE = /^PLAN FRAGMENT (\d+)/;
const NODE_RE = /^(\s*)(\|----)?(\d+):(\S[^\n]*)$/;
const EXCHANGE_ID_RE = /^\s*OutPut Exchange Id:\s*(\d+)/i;

export function parsePlan(raw: string): ParsedPlan {
	const nodes = new Map<number, PlanNode>();
	const edges: PlanEdge[] = [];

	let fragment = -1;
	let fragmentRoot: PlanNode | null = null;
	/** Trunk stack: last node seen per indent depth, innermost last. */
	let stack: { depth: number; node: PlanNode }[] = [];
	let current: PlanNode | null = null;
	/** fragment id → exchange node id its root feeds. */
	const fragmentSink = new Map<number, number>();
	const fragmentRoots = new Map<number, PlanNode>();

	for (const line of raw.split('\n')) {
		const fragmentMatch = FRAGMENT_RE.exec(line);
		if (fragmentMatch) {
			fragment = Number(fragmentMatch[1]);
			fragmentRoot = null;
			stack = [];
			current = null;
			continue;
		}
		if (fragment < 0) continue;

		const nodeMatch = NODE_RE.exec(line);
		if (nodeMatch) {
			const [, indent, branch, idText, typeText] = nodeMatch;
			const depth = indent.length + (branch ? branch.length : 0);
			const node: PlanNode = {
				id: Number(idText),
				type: typeText.trim(),
				fragment,
				detail: [],
				cardinality: null,
				subtitle: null
			};
			nodes.set(node.id, node);
			current = node;

			if (!fragmentRoot) {
				fragmentRoot = node;
				fragmentRoots.set(fragment, node);
				stack = [{ depth, node }];
				continue;
			}

			if (branch) {
				// Build-side child of the nearest shallower trunk node.
				const parent = [...stack].reverse().find((entry) => entry.depth < depth);
				if (parent) edges.push({ from: node.id, to: parent.node.id, kind: 'local' });
				stack.push({ depth, node });
			} else {
				// Continuation child: pop anything deeper, feed the node at this depth.
				stack = stack.filter((entry) => entry.depth <= depth);
				const parent = stack.findLast((entry) => entry.depth === depth);
				if (parent) {
					edges.push({ from: node.id, to: parent.node.id, kind: 'local' });
					stack = stack.filter((entry) => entry !== parent);
				}
				stack.push({ depth, node });
			}
			continue;
		}

		// Not a node line: fragment attribute or node detail.
		const exchangeMatch = EXCHANGE_ID_RE.exec(line);
		if (exchangeMatch && !current) {
			fragmentSink.set(fragment, Number(exchangeMatch[1]));
			continue;
		}
		if (current) {
			const text = line.replace(/^\s*(\|(----)?\s*)*/, '').trimEnd();
			if (text) current.detail.push(text);
		}
	}

	// Inter-fragment edges: fragment root → the exchange node it feeds.
	for (const [frag, exchangeId] of fragmentSink) {
		const root = fragmentRoots.get(frag);
		if (root && nodes.has(exchangeId)) {
			edges.push({ from: root.id, to: exchangeId, kind: 'exchange' });
		}
	}

	// Synthetic RESULT sink fed by fragment 0's root.
	const resultRoot = fragmentRoots.get(0);
	if (resultRoot) {
		const result: PlanNode = {
			id: RESULT_NODE_ID,
			type: 'RESULT',
			fragment: 0,
			detail: [],
			cardinality: null,
			subtitle: null
		};
		nodes.set(result.id, result);
		edges.push({ from: resultRoot.id, to: result.id, kind: 'exchange' });
	}

	for (const node of nodes.values()) annotate(node);

	return { nodes: [...nodes.values()], edges, raw };
}

/** Pull display hints out of the detail lines. */
function annotate(node: PlanNode): void {
	for (const line of node.detail) {
		const cardinality = /^cardinality[:=]\s*([\d.]+)/i.exec(line);
		if (cardinality) node.cardinality = Number(cardinality[1]);

		if (!node.subtitle) {
			const table = /^table:\s*(\S+?)(?:,|$)/i.exec(line);
			if (table) node.subtitle = table[1];
			const join = /^join op:\s*(.+)$/i.exec(line);
			if (join) node.subtitle = join[1];
			const dist = /^distribution type:\s*(\S+)/i.exec(line);
			if (dist) node.subtitle = dist[1];
		}
	}
}
