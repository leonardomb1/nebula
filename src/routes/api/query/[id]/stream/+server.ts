import { error, type RequestHandler } from '@sveltejs/kit';
import { getRun, subscribe, type RunEvent } from '$lib/server/queryRuns';

/**
 * SSE stream of a run's events: full replay of what already happened, then
 * live follow. Reattachable — a reloaded tab replays the same run. A 15s
 * comment keeps quiet connections alive through proxies and mobile networks.
 */
export const GET: RequestHandler = ({ params, locals }) => {
	const run = getRun(params.id!);
	if (!run || run.username !== locals.user!.username) error(404, 'unknown run');

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		start(controller) {
			let closed = false;
			let unsubscribe = () => {};
			let heartbeat: ReturnType<typeof setInterval> | undefined;

			const close = () => {
				if (closed) return;
				closed = true;
				unsubscribe();
				if (heartbeat) clearInterval(heartbeat);
				try {
					controller.close();
				} catch {
					// already closed by the client
				}
			};

			const send = (event: RunEvent) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
				} catch {
					close();
					return;
				}
				if (event.type === 'done') close();
			};

			heartbeat = setInterval(() => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(': keepalive\n\n'));
				} catch {
					close();
				}
			}, 15_000);

			// Replay, then follow. The events array only ever grows, and 'done' is
			// always the final entry, so a snapshot iteration cannot miss events —
			// anything appended after the snapshot arrives via the listener.
			unsubscribe = subscribe(run, send);
			for (const event of [...run.events]) send(event);
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-store',
			connection: 'keep-alive'
		}
	});
};
