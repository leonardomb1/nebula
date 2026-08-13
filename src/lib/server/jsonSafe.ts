/** mysql2 cell values → JSON-serializable values, without lying about types. */
export function jsonSafe(value: unknown): unknown {
	if (value === null || value === undefined) return null;
	if (value instanceof Date) return value.toISOString();
	if (typeof value === 'bigint') return value.toString();
	if (Buffer.isBuffer(value)) return value.toString('utf8');
	if (Array.isArray(value)) return value.map(jsonSafe);
	if (typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonSafe(v)])
		);
	}
	if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
	return value;
}
