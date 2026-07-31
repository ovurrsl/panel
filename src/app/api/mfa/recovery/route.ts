import { fail, handler, ok, parseBody } from '@/lib/api';
import { mfaRecoverySchema, type MfaRecoveryResponse } from '@/lib/api-contract';
import { audit } from '@/lib/auth/audit';
import { clearFailures, lockStateFrom, registerFailure } from '@/lib/auth/lockout';
import { clearMfaPending, getSession } from '@/lib/auth/session';
import { consumeRecoveryCode } from '@/lib/auth/totp';
import { findUserById } from '@/lib/auth/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/mfa/recovery — sign in with a single-use recovery code.
 *
 * A spent code is never re-usable: consumeRecoveryCode marks it inside a
 * transaction with SELECT ... FOR UPDATE, so two racing requests cannot both
 * redeem the same one.
 */
export const POST = handler(async (request: Request) => {
  const parsed = await parseBody(request, mfaRecoverySchema);
  if (!parsed.ok) return fail('recovery_invalid', 'err.recoveryInvalid');

  const session = await getSession();
  if (!session) return fail('unauthenticated', 'err.sessionExpired');

  const user = await findUserById(session.userId);
  if (!user) return fail('unauthenticated', 'err.sessionExpired');

  const lock = lockStateFrom(user.failed_attempts, user.locked_until);
  if (lock.locked) return fail('account_locked', 'err.locked', { retryAfterSeconds: lock.retryAfterSeconds });

  const { ok: matched, remaining } = await consumeRecoveryCode(session.userId, parsed.data.code);

  if (!matched) {
    const next = await registerFailure(session.userId);
    await audit({
      actorUserId: session.userId,
      actorLabel: user.email,
      level: 'warn',
      kind: 'mfa',
      message: `Recovery code rejected (attempt ${next.failedAttempts})`,
      event: { k: 'recoveryRejected', p: { attempt: next.failedAttempts } },
    });
    return next.locked
      ? fail('account_locked', 'err.locked', { retryAfterSeconds: next.retryAfterSeconds })
      : fail('recovery_invalid', 'err.recoveryInvalid', { attemptsLeft: next.attemptsLeft });
  }

  await clearFailures(session.userId);
  await clearMfaPending(session.id);

  await audit({
    actorUserId: session.userId,
    actorLabel: user.email,
    level: 'warn',
    kind: 'mfa',
    message: 'Recovery code used — code retired',
    event: { k: 'recoveryUsed' },
    meta: { codesRemaining: remaining },
  });

  const refreshed = await getSession({ touch: false });
  const body: MfaRecoveryResponse = {
    state: user.must_change_password === 1 ? 'firstSignIn' : 'signedIn',
    user: refreshed?.user,
    codesRemaining: remaining,
  };
  return ok(body);
});
