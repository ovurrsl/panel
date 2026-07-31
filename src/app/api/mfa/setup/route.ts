import { fail, handler, ok } from '@/lib/api';
import type { MfaSetupResponse } from '@/lib/api-contract';
import { audit } from '@/lib/auth/audit';
import { getSession } from '@/lib/auth/session';
import { isEnrolled, startEnrolment } from '@/lib/auth/totp';
import { pendingLabel } from '@/lib/auth/users';
import { findUserById } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mfa/setup — issues a fresh TOTP secret and its QR.
 *
 * Reachable with an mfaPending session on purpose: the enrolment path is exactly
 * the case where the user has proved their password but cannot yet clear the OTP
 * step. Already-confirmed enrolment is refused, so an attacker holding a
 * half-open session cannot silently swap someone's authenticator.
 */
export const POST = handler(async () => {
  const session = await getSession();
  if (!session) return fail('unauthenticated', 'err.sessionExpired');

  if (await isEnrolled(session.userId)) return fail('conflict', 'err.mfaAlreadyEnrolled');

  const user = await findUserById(session.userId);
  if (!user) return fail('unauthenticated', 'err.sessionExpired');

  const { qrDataUrl, manualKey } = await startEnrolment(session.userId, pendingLabel(user));

  await audit({
    actorUserId: session.userId,
    actorLabel: user.email,
    level: 'info',
    kind: 'mfa',
    message: 'Two-factor enrolment started',
  });

  const body: MfaSetupResponse = { qrDataUrl, manualKey };
  return ok(body);
});
