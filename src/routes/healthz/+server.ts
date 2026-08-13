import { json } from '@sveltejs/kit';

// Liveness probe for the compose healthcheck / orchestrators.
export function GET() {
	return json({ status: 'ok' });
}
