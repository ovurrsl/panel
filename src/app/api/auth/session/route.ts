import { handler, ok } from '@/lib/api';
import type { SessionResponse } from '@/lib/api-contract';
import { getSession } from '@/lib/auth/session';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/auth/session
 *
 * The single source of truth for the idle countdown. The client polls it; the
 * server owns `expiresInSeconds`, so a tampered clock or a stale tab cannot
 * stretch a session past settings.session_minutes.
 *
 * Reading the session slides the idle window — which is correct here, because a
 * poll from a visible tab is activity. The client stops polling when the tab is
 * hidden so a background tab does not keep a session alive forever.
 */
export const GET = handler(async () => {
  const settings = await getSettings();
  const session = await getSession();

  if (!session) {
    const body: SessionResponse = {
      state: 'anonymous',
      user: null,
      expiresInSeconds: 0,
      sessionMinutes: settings.sessionMinutes,
    };
    return ok(body);
  }

  const body: SessionResponse = {
    state: session.state,
    user: session.user,
    expiresInSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000)),
    sessionMinutes: settings.sessionMinutes,
  };
  return ok(body);
});
