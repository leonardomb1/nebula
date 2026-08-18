import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';

/**
 * Saved query files, one directory of plain .sql per user under
 * DATA_DIR/queries. Same shape as the token store: filesystem + single
 * process by design (adapter-node, one container) — swap this module for
 * object storage or a table before scaling out.
 */

/** 1 MiB is far past any hand-written query; it just bounds the write. */
const MAX_BYTES = 1024 * 1024;

/** No separators, no leading dot — a name can only ever land inside the user's own directory. */
const NAME_RE = /^[\p{L}\p{N}_][\p{L}\p{N} _.()[\]-]{0,79}$/u;

export interface QueryFile {
	name: string;
	updatedAt: number;
}

/** Normalises a client-supplied name to `<name>.sql`, or null if it is not one. */
export function safeName(raw: string | undefined | null): string | null {
	const base = (raw ?? '').trim().replace(/\.sql$/i, '').trim();
	return NAME_RE.test(base) ? `${base}.sql` : null;
}

function dirFor(username: string): string {
	const safe = username.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
	return join(env.DATA_DIR ?? 'data', 'queries', safe);
}

export async function listFiles(username: string): Promise<QueryFile[]> {
	const dir = dirFor(username);
	let entries: string[];
	try {
		entries = await readdir(dir);
	} catch {
		return []; // nothing saved yet
	}

	const files = await Promise.all(
		entries
			.filter((entry) => entry.endsWith('.sql'))
			.map(async (name) => ({
				name,
				updatedAt: await stat(join(dir, name))
					.then((s) => s.mtimeMs)
					.catch(() => 0)
			}))
	);
	return files.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readFileSql(username: string, name: string): Promise<string | null> {
	try {
		return await readFile(join(dirFor(username), name), 'utf8');
	} catch {
		return null;
	}
}

export async function writeFileSql(username: string, name: string, sql: string): Promise<void> {
	const dir = dirFor(username);
	await mkdir(dir, { recursive: true });
	await writeFile(join(dir, name), sql.slice(0, MAX_BYTES), 'utf8');
}

export async function removeFile(username: string, name: string): Promise<void> {
	try {
		await unlink(join(dirFor(username), name));
	} catch {
		// already gone
	}
}

/** Returns false when the target name is taken — renaming never overwrites. */
export async function renameFileSql(username: string, from: string, to: string): Promise<boolean> {
	const dir = dirFor(username);
	if (from === to) return true;
	try {
		await stat(join(dir, to));
		return false;
	} catch {
		// free
	}
	await rename(join(dir, from), join(dir, to));
	return true;
}
