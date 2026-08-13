import { createHash } from 'node:crypto';
import { EncryptJWT, jwtDecrypt } from 'jose';
import type { Cookies } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { cookieSecure } from './oidcFlow';
import type { OidcClaims } from './oidc';

/**
 * The app session: an encrypted JWT (JWE, dir + A256GCM) in an httpOnly
 * cookie. The cookie carries identity only — never a warehouse credential;
 * StarRocks id_tokens are minted server-side from the refresh-token store.
 */

export const SESSION_COOKIE = 'nebula_session';
const TTL_SECONDS = 24 * 60 * 60;

export interface SessionUser {
	/** Lowercased preferred_username — also the StarRocks user name. */
	username: string;
	displayName: string;
	email: string | null;
}

function key(): Buffer {
	const value = env.SESSION_SECRET;
	if (!value) throw new Error('SESSION_SECRET is not set');
	return createHash('sha256').update(value).digest();
}

/** The canonical username: what the IdP asserts, never what the user typed. */
export function usernameFromClaims(claims: OidcClaims): string {
	return (claims.preferred_username ?? claims.sub).toLowerCase();
}

export function sessionUserFromClaims(claims: OidcClaims): SessionUser {
	const username = usernameFromClaims(claims);
	return {
		username,
		displayName: claims.name ?? username,
		email: claims.email ?? null
	};
}

function cookieOptions(url: URL) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: cookieSecure(url),
		maxAge: TTL_SECONDS
	};
}

export async function createSession(cookies: Cookies, url: URL, user: SessionUser): Promise<void> {
	const token = await new EncryptJWT({
		displayName: user.displayName,
		email: user.email
	})
		.setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
		.setSubject(user.username)
		.setIssuedAt()
		.setExpirationTime(`${TTL_SECONDS}s`)
		.encrypt(key());

	cookies.set(SESSION_COOKIE, token, cookieOptions(url));
}

export async function readSession(cookies: Cookies): Promise<SessionUser | null> {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;

	try {
		const { payload } = await jwtDecrypt(token, key());
		if (typeof payload.sub !== 'string' || !payload.sub) return null;
		return {
			username: payload.sub,
			displayName: typeof payload.displayName === 'string' ? payload.displayName : payload.sub,
			email: typeof payload.email === 'string' ? payload.email : null
		};
	} catch {
		// Expired, tampered, or minted under an old SESSION_SECRET — sign in again.
		return null;
	}
}

export function clearSession(cookies: Cookies, url: URL): void {
	cookies.delete(SESSION_COOKIE, cookieOptions(url));
}
