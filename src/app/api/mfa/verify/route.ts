import { fail, handler, ok, parseBody } from '@/lib/api';
import { mfaVerifySchema, type MfaVerifyResponse } from '@/lib/api-contract';
import { audit } from '@/lib/auth/audit';
import { clearFailures, lockStateFrom, registerFailure } from '@/lib/auth/lockout';
import { clearMfaPending, getSession } from '@/lib/auth/session';
import { confirmEnrolment, isEnrolled, verifyTotp } from '@/lib/auth/totp';
import { findUserById, pendingLabel } from '@/lib/auth/users';
import { exec } from '@/lib/db';
import { getSettings } from '@/lib/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mfa/verify — the OTP step, for both sign-in and first enrolment.
 *
 * Which one it is depends on whether a confirmed secret already exists:
 *   confirmed   -> validate and clear mfa_pending
 *   unconfirmed -> validate, confirm, and return the recovery codes once
 *
 * The same failed_attempts counter that guards the password guards this step —
 * an unlimited OTP retry loop would reduce 2FA to a six-digit lottery.
 */
export const POST = handler(async (request: Request) => {
  const parsed = await parseBody(request, mfaVerifySchema);
  if (!parsed.ok) return parsed.response;

  const session = await getSession();
  if (!session) return fail('unauthenticated', 'err.sessionExpired');

  const user = await findUserById(session.userId);
  if (!user) return fail('unauthenticated', 'err.sessionExpired');

  const lock = lockStateFrom(user.failed_attempts, user.locked_until);
  if (lock.locked) return fail('account_locked', 'err.locked', { retryAfterSeconds: lock.retryAfterSeconds });

  const label = pendingLabel(user);
  const alreadyEnrolled = await isEnrolled(session.userId);
  let recoveryCodes: string[] | undefined;

  if (alreadyEnrolled) {
    if (!(await verifyTotp(session.userId, label, parsed.data.code))) {
      const next = await registerFailure(session.userId);
      await audit({
        actorUserId: session.userId,
        actorLabel: user.email,
        level: 'warn',
        kind: 'mfa',
        message: `Two-factor code rejected (attempt ${next.failedAttempts})`,
      });
      return next.locked
        ? fail('account_locked', 'err.locked', { retryAfterSeconds: next.retryAfterSeconds })
        : fail('mfa_invalid', 'err.mfaInvalid', { attemptsLeft: next.attemptsLeft });
    }
  } else {
    const codes = await confirmEnrolment(session.userId, label, parsed.data.code);
    if (!codes) {
      const next = await registerFailure(session.userId);
      return next.locked
        ? fail('account_locked', 'err.locked', { retryAfterSeconds: next.retryAfterSeconds })
        : fail('mfa_invalid', 'err.mfaInvalid', { attemptsLeft: next.attemptsLeft });
    }
    recoveryCodes = codes;
    await audit({
      actorUserId: session.userId,
      actorLabel: user.email,
      level: 'info',
      kind: 'mfa',
      message: 'Two-factor enrolled',
    });
  }

  await clearFailures(session.userId);
  await clearMfaPending(session.id);

  if (parsed.data.trustDevice) {
    const { trustedDeviceDays } = await getSettings();
    await exec('UPDATE sessions SET trusted_until = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?', [
      trustedDeviceDays,
      session.id,
    ]);
  }

  if (alreadyEnrolled) {
    await audit({
      actorUserId: session.userId,
      actorLabel: user.email,
      level: 'info',
      kind: 'auth',
      message: 'Signed in — two-factor cleared',
      meta: { trustedDevice: parsed.data.trustDevice },
    });
  }

  const refreshed = await getSession({ touch: false });
  const body: MfaVerifyResponse = {
    state: user.must_change_password === 1 ? 'firstSignIn' : 'signedIn',
    user: refreshed?.user,
    ...(recoveryCodes ? { recoveryCodes } : {}),
  };
  return ok(body);
});
