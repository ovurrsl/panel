import { fail, handler, ok } from '@/lib/api';
import { requireSession } from '@/lib/auth/guard';
import { readHealth } from '@/lib/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/health — real process measurement, polled every 4 s by Overview. */
export const GET = handler(async () => {
  const guard = await requireSession();
  if (!guard.ok) return fail('unauthenticated', 'err.sessionExpired');
  return ok(readHealth());
});
