import { fail, handler, ok } from '@/lib/api'
import { requirePermission } from '@/lib/auth/guard'
import { listJobs, startJobWorker } from '@/lib/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/jobs?status= — the queue, newest first. */
export const GET = handler(async (request: Request) => {
  const guard = await requirePermission('admin_access')
  if (!guard.ok) {
    return guard.reason === 'forbidden'
      ? fail('forbidden', 'err.forbidden')
      : fail('unauthenticated', 'err.sessionExpired')
  }

  startJobWorker()
  const status = new URL(request.url).searchParams.get('status') ?? undefined
  return ok({ jobs: await listJobs(status) })
})
