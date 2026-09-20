import { fail, requireUser } from '@/lib/server/core';
import { partyEvents, requirePartyMember } from '@/lib/server/watch-parties';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  context: RouteContext<'/api/watch-parties/[code]/events'>,
) {
  try {
    const user = await requireUser(request);
    const { code } = await context.params;
    await requirePartyMember(code, user);
    const url = new URL(request.url);
    let cursor = Math.max(
      0,
      Number(
        request.headers.get('last-event-id') || url.searchParams.get('after'),
      ) || 0,
    );
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let stopped = false;
        const close = () => {
          if (stopped) return;
          stopped = true;
          if (timer) clearTimeout(timer);
          try {
            controller.close();
          } catch {}
        };
        const started = Date.now();
        const poll = async () => {
          if (stopped || request.signal.aborted) return close();
          try {
            const events = await partyEvents(code, user, cursor);
            for (const item of events) {
              cursor = item.id;
              controller.enqueue(
                encoder.encode(
                  `id: ${item.id}\ndata: ${JSON.stringify(item)}\n\n`,
                ),
              );
            }
            if (!events.length)
              controller.enqueue(
                encoder.encode(`: heartbeat ${Date.now()}\n\n`),
              );
          } catch {
            return close();
          }
          if (Date.now() - started >= 55_000) return close();
          timer = setTimeout(poll, 2000);
        };
        controller.enqueue(encoder.encode(`retry: 2000\n: connected\n\n`));
        void poll();
        request.signal.addEventListener('abort', close, { once: true });
      },
      cancel() {
        if (timer) clearTimeout(timer);
      },
    });
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    return fail(error);
  }
}
