import { error, json, type RequestHandler } from '@sveltejs/kit';
import { connectAsUser, warehouseCredentials, WarehouseAuthRequired } from '$lib/server/db';
import { parseProfile } from '$lib/server/profileParser';

const QUERY_ID_RE = /^[0-9a-fA-F-]{16,64}$/;

/**
 * Execution profile of a finished (profiled) query as a plan DAG with actual
 * metrics. Profiles live in the memory of the FE that ran the query — with a
 * single FE (or FE-pinned connections) this resolves; a multi-FE cluster
 * behind a load balancer may 404 for queries that ran elsewhere.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const body = (await request.json().catch(() => null)) as { queryId?: string } | null;
	const queryId = body?.queryId?.trim();
	if (!queryId || !QUERY_ID_RE.test(queryId)) error(400, 'invalid queryId');

	let conn;
	try {
		conn = await connectAsUser(warehouseCredentials(locals.user!.username));
	} catch (err) {
		if (err instanceof WarehouseAuthRequired) error(401, 'warehouse sign-in required');
		throw err;
	}

	try {
		const [rows] = await conn.query('SELECT get_query_profile(?) AS p', [queryId]);
		const raw = String((rows as { p: unknown }[])[0]?.p ?? '');
		if (!raw.trim()) error(404, 'no profile for this query (was profiling enabled?)');

		const profile = parseProfile(raw);
		if (!profile) error(422, 'profile could not be parsed');

		return json({
			nodes: profile.nodes.map((node) => ({
				id: node.id,
				type: node.name,
				fragment: 0,
				detail: [],
				cardinality: null,
				subtitle: null,
				actualRows: node.rows,
				timeMs: node.timeNs / 1e6,
				timePct: node.timePct
			})),
			edges: profile.edges.map((edge) => ({ ...edge, kind: 'local' as const })),
			summary: profile.summary
		});
	} finally {
		await conn.end().catch(() => {});
	}
};
