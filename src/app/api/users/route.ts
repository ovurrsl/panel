import { fail, handler, ok, parseBody } from '@/lib/api'
import {
  type CreateUserResponse,
  createUserSchema,
  type UsersListResponse,
} from '@/lib/api-contract'
import { audit } from '@/lib/auth/audit'
import { requirePermission } from '@/lib/auth/guard'
import { issueInvitation } from '@/lib/auth/invitations'
import { allRoles } from '@/lib/auth/roles'
import { WORK_DOMAIN } from '@/lib/auth/users'
import { queryOne, type RowDataPacket } from '@/lib/db'
import { deliverInvite } from '@/lib/mail'
import { getSettings } from '@/lib/settings'
import type { Lang } from '@/lib/types'
import {
  createInvitedUser,
  getUserDetail,
  listUsers,
  siteNames,
  type UserSortKey,
} from '@/lib/users'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SORTS: UserSortKey[] = ['name', 'email', 'username', 'role', 'status']

/**
 * GET /api/users — search, role filter, sort, page.
 *
 * Readable by any signed-in account; `canEdit` in the response is what the
 * read-only banner keys off. Mutation is a separate gate below.
 */
export const GET = handler(async (request: Request) => {
  const guard = await requirePermission('admin_access')
  if (!guard.ok) {
    return guard.reason === 'forbidden'
      ? fail('forbidden', 'err.forbidden')
      : fail('unauthenticated', 'err.sessionExpired')
  }

  const url = new URL(request.url)
  const sortParam = url.searchParams.get('sort')
  const langParam = url.searchParams.get('lang')

  const result = await listUsers({
    search: url.searchParams.get('search') ?? undefined,
    role: url.searchParams.get('role') ?? undefined,
    sort: SORTS.includes(sortParam as UserSortKey) ? (sortParam as UserSortKey) : 'name',
    direction: url.searchParams.get('direction') === 'desc' ? 'desc' : 'asc',
    page: Number(url.searchParams.get('page') ?? 1) || 1,
    pageSize: Number(url.searchParams.get('pageSize') ?? 10) || 10,
    lang: (langParam === 'tr' ? 'tr' : 'en') as Lang,
  })

  const body: UsersListResponse = {
    ...result,
    sites: await siteNames(),
    roles: (await allRoles()).map((r) => r.name),
    canEdit: guard.session.user.permissions.includes('edit_users'),
  }
  return ok(body)
})

/**
 * POST /api/users — creates an invited account and issues its invite link.
 *
 * The account never gets a password here: it lands in `invited` state with a
 * one-shot token, and sets its own password through /welcome. That is what keeps
 * the old panel's "admin types the password into a form" pattern from coming back.
 */
export const POST = handler(async (request: Request) => {
  const guard = await requirePermission('edit_users')
  if (!guard.ok) {
    return guard.reason === 'forbidden'
      ? fail('forbidden', 'err.forbidden')
      : fail('unauthenticated', 'err.sessionExpired')
  }

  const parsed = await parseBody(request, createUserSchema)
  if (!parsed.ok) return parsed.response

  const { fullName, role, org, siteNames: sites } = parsed.data
  const settings = await getSettings()
  if (org === 'external' && !settings.externalUsersAllowed) {
    return fail('forbidden', 'err.externalNotAllowed')
  }

  // Resolve email and username
  let email = parsed.data.email ? parsed.data.email.trim().toLowerCase() : ''
  let username = parsed.data.username ? parsed.data.username.trim().toLowerCase() : ''

  if (!email && username) {
    email = `${username}${WORK_DOMAIN}`
  } else if (email && !username) {
    const prefix = email.split('@')[0]!.replace(/[^a-z0-9._-]/g, '').slice(0, 64)
    username = prefix || `user_${Date.now().toString(36)}`
  }

  if (!email || !username) {
    return fail('validation', 'err.fields')
  }

  // Check email uniqueness
  const emailClash = await queryOne<RowDataPacket & { id: number }>(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [email],
  )
  if (emailClash) return fail('conflict', 'err.userExists')

  // Check username uniqueness; if auto-derived or colliding with existing username, disambiguate
  let candidateUsername = username
  let clash = await queryOne<RowDataPacket & { id: number }>(
    'SELECT id FROM users WHERE username = ? LIMIT 1',
    [candidateUsername],
  )
  if (clash) {
    if (!parsed.data.email && parsed.data.username) {
      return fail('conflict', 'err.userExists')
    }
    const domainTag = email.includes('@') ? email.split('@')[1]!.split('.')[0]! : 'ext'
    candidateUsername = `${username.slice(0, 50)}.${domainTag}`.slice(0, 64)
    clash = await queryOne<RowDataPacket & { id: number }>(
      'SELECT id FROM users WHERE username = ? LIMIT 1',
      [candidateUsername],
    )
    if (clash) {
      candidateUsername = `${username.slice(0, 56)}_${Math.floor(1000 + Math.random() * 9000)}`
    }
  }
  username = candidateUsername

  const created = await createInvitedUser(
    { fullName, username, email, role, org, siteNames: sites },
    guard.session.userId,
  )
  const issued = await issueInvitation(created.userId, guard.session.userId)
  await deliverInvite({
    email,
    fullName,
    token: issued.token,
    expiresAt: issued.invitation.expiresAt,
  })

  const detail = await getUserDetail(created.publicId)
  if (!detail) return fail('server_error', 'err.server')

  // Log the role that was stored, not the one that was asked for: an external
  // account is clamped to Viewer on write, and an audit line claiming otherwise
  // is worse than no line at all.
  await audit({
    actorUserId: guard.session.userId,
    actorLabel: guard.session.user.email,
    level: 'info',
    kind: 'user',
    message: `User invited: ${email} as ${detail.role}`,
    event: { k: 'userInvited', p: { email, role: String(detail.role) } },
    meta: { requestedRole: role, storedRole: detail.role, org, sites },
  })

  const body: CreateUserResponse = { user: detail, invitation: issued.invitation }
  return ok(body, { status: 201 })
})
