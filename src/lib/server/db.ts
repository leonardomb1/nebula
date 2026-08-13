import mysql from 'mysql2/promise';
import { env } from '$env/dynamic/private';
import { currentIdToken } from './oidcStore';

/**
 * StarRocks connections over the MySQL protocol, authenticated AS THE GIVEN
 * USER via JWT passthrough (StarRocks >= 3.5, `authentication_jwt` — see
 * deploy/starrocks/README.md; all server-side setup is owned by the StarRocks
 * team, this app only connects).
 *
 * Ported from perguntai's proven implementation.
 */

export class WarehouseAuthRequired extends Error {
	constructor(username: string) {
		super(`No usable StarRocks credential for ${username} — the user must sign in again`);
		this.name = 'WarehouseAuthRequired';
	}
}

/**
 * MySQL length-encoded string.
 * https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_basic_dt_strings.html
 */
function lengthEncoded(buf: Buffer): Buffer {
	const n = buf.length;
	if (n < 251) return Buffer.concat([Buffer.from([n]), buf]);
	if (n < 65536) {
		const head = Buffer.alloc(3);
		head[0] = 0xfc;
		head.writeUInt16LE(n, 1);
		return Buffer.concat([head, buf]);
	}
	const head = Buffer.alloc(4);
	head[0] = 0xfd;
	head.writeUIntLE(n, 1, 3);
	return Buffer.concat([head, buf]);
}

/**
 * mysql2 has no built-in handler for the plugin StarRocks requests for JWT
 * users, so supply one. The payload is a capability byte followed by the
 * length-encoded id_token; sending the raw token instead makes the server read
 * its first byte as a length and truncate it, which surfaces as the
 * distinctly unhelpful "Missing second delimiter" JWT parse error.
 */
function openIdConnectPlugin(idToken: string) {
	return {
		authentication_openid_connect_client: () => () =>
			Buffer.concat([Buffer.from([0x01]), lengthEncoded(Buffer.from(idToken, 'utf8'))])
	};
}

export interface WarehouseCredentials {
	username: string;
	/** When set (even empty), native password auth is used instead of JWT. */
	password?: string;
}

/**
 * The credentials a session user's queries run with. Normally the user's own
 * identity (JWT passthrough). DEV_STARROCKS_USER overrides it for local dev
 * against the compose StarRocks where no IdP is wired — dev only, never set
 * it in production: it makes every user query run as that one account.
 */
export function warehouseCredentials(username: string): WarehouseCredentials {
	if (env.DEV_STARROCKS_USER) {
		return { username: env.DEV_STARROCKS_USER, password: env.DEV_STARROCKS_PASSWORD ?? '' };
	}
	return { username };
}

/**
 * Opens a short-lived connection authenticated as the given user.
 *
 * The handshake NEVER carries a default database: StarRocks kills the
 * handshake outright (PROTOCOL_CONNECTION_LOST, no clean access-denied) for a
 * valid user who merely lacks access to it. Callers that want a current
 * database issue `USE` after connecting, where errors are real errors.
 */
export async function connectAsUser(credentials: WarehouseCredentials): Promise<mysql.Connection> {
	const base = {
		host: env.STARROCKS_HOST ?? 'localhost',
		port: Number(env.STARROCKS_PORT ?? 9030),
		user: credentials.username,
		connectTimeout: 5000
	};

	let options: mysql.ConnectionOptions;
	if (credentials.password != null) {
		// Native/LDAP path — service accounts and the dev override.
		options = { ...base, password: credentials.password, enableCleartextPlugin: true };
	} else {
		const idToken = await currentIdToken(credentials.username);
		if (!idToken) throw new WarehouseAuthRequired(credentials.username);
		options = { ...base, password: '', authPlugins: openIdConnectPlugin(idToken) };
	}

	return mysql.createConnection(options);
}

/** Quotes an identifier for interpolation into SQL (`USE`, SHOW ... FROM). */
export function quoteIdent(name: string): string {
	return '`' + name.replaceAll('`', '``') + '`';
}
