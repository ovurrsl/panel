import { fail, handler, ok } from '@/lib/api';
import { audit } from '@/lib/auth/audit';
import { requirePermission } from '@/lib/auth/guard';
import { retryJob } from '@/lib/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/jobs/:id/retry — re-queues a failed or cancelled job. */
export const POST = handler(async (_request: Request, ctx: { params: Promise<{ id: string }> }) => {
  const guard = await requirePermission('admin_access');
  if (!guard.ok) {
    return guard.reason === 'forbidden' ? fail('forbidden', 'err.forbidden') : fail('unauthenticated', 'err.sessionExpired');
  }

  const { id } = await ctx.params;
  const job = await retryJob(id);
  if (!job) return fail('conflict', 'err.jobNotRetryable');

  await audit({
    actorUserId: guard.session.userId,
    actorLabel: guard.session.user.email,
    level: 'info',
    kind: 'job',
    message: `Job re-queued: ${id} (${job.kind}), attempt ${job.attempts + 1}`,
  });

  return ok({ job });
});
