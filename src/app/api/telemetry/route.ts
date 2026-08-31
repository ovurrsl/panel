import { fail, handler, ok, parseBody } from '@/lib/api'
import { telemetrySchema } from '@/lib/api-contract'
import { audit } from '@/lib/auth/audit'
import { getSession } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface TokenBucket {
  tokens: number
  lastRefill: number
}

const BUCKET_CAPACITY = 10
const REFILL_RATE_PER_MS = 10 / (60 * 1000) // 10 tokens per 60,000ms (10/min)
const rateLimitMap = new Map<string, TokenBucket>()

export function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  let bucket = rateLimitMap.get(ip)

  if (!bucket) {
    bucket = { tokens: BUCKET_CAPACITY - 1, lastRefill: now }
    rateLimitMap.set(ip, bucket)
    return true
  }

  const elapsed = now - bucket.lastRefill
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsed * REFILL_RATE_PER_MS)
  bucket.lastRefill = now

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return true
  }

  // Periodic cleanup if map grows large
  if (rateLimitMap.size > 5000) {
    for (const [k, v] of rateLimitMap.entries()) {
      if (now - v.lastRefill > 5 * 60 * 1000) {
        rateLimitMap.delete(k)
      }
    }
  }

  return false
}

export function resetRateLimits(): void {
  rateLimitMap.clear()
}

/**
 * POST /api/telemetry — the browser error sink.
 *
 * Recorded with actor_label 'browser', as the contract specifies, which is also
 * what keeps it out of the "connected users" panel. The client suppresses
 * repeats for 5 s; this side additionally refuses to trust anything in the
 * payload beyond its shape — the message is truncated and never interpolated
 * into anything but the log text.
 *
 * Protected by an in-memory token bucket rate limiter (10 req/min per client IP)
 * returning HTTP 429 when exceeded.
 */
export const POST = handler(async (request: Request) => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'

  if (!checkRateLimit(ip)) {
    return fail('rate_limited', 'err.rateLimited')
  }

  const parsed = await parseBody(request, telemetrySchema)
  if (!parsed.ok) return ok({ accepted: false }, { status: 202 })

  const session = await getSession({ touch: false })
  const { message, source, line, column, stack } = parsed.data

  await audit({
    actorUserId: session?.userId ?? null,
    actorLabel: 'browser',
    level: 'error',
    kind: 'telemetry',
    message: `Browser error captured: ${message}`.slice(0, 1024),
    event: { k: 'browserError', p: { message: message.slice(0, 900) } },
    meta: {
      source: source?.slice(0, 512) ?? null,
      line: line ?? null,
      column: column ?? null,
      stack: stack?.slice(0, 2048) ?? null,
      user: session?.user.email ?? null,
    },
  })

  return ok({ accepted: true }, { status: 202 })
})
