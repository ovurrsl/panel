import type { Permission } from '../types'
import { permissionsForRole } from './roles'
import { type ActiveSession, getSession } from './session'

export type GuardFailure = 'unauthenticated' | 'mfa_required' | 'forbidden'

export type GuardResult = { ok: true; session: ActiveSession } | { ok: false; reason: GuardFailure }

/**
 * Server-side permission gate. Section 08's rule, restated: the console only
 * edits, the server enforces. Client-side permission checks exist to hide UI —
 * they are never the thing that stops a request.
 *
 * An mfaPending session is treated as not-signed-in for every purpose except the
 * MFA endpoints themselves, which read the session directly.
 */
export async function requirePermission(...required: Permission[]): Promise<GuardResult> {
  const session = await getSession()
  if (!session) return { ok: false, reason: 'unauthenticated' }
  if (session.mfaPending) return { ok: false, reason: 'mfa_required' }

  const granted = new Set(session.user.permissions)
  if (required.every((perm) => granted.has(perm))) return { ok: true, session }

  return { ok: false, reason: 'forbidden' }
}

/**
 * Server-side site-scoped permission gate.
 * Validates whether the user is a global Admin OR holds a site assignment on siteId
 * granting all required permissions.
 */
export async function requireSitePermission(
  siteId: string,
  ...required: Permission[]
): Promise<GuardResult> {
  const session = await getSession()
  if (!session) return { ok: false, reason: 'unauthenticated' }
  if (session.mfaPending) return { ok: false, reason: 'mfa_required' }

  // Global Admin always possesses full authority across all sites
  if (session.user.permissions.includes('admin_access')) {
    return { ok: true, session }
  }

  // Look up role for the specific site (handles siteId or siteName keying)
  const siteRole = session.user.siteRoles?.[siteId]
  const sitePerms = siteRole ? await permissionsForRole(siteRole) : []

  const combined = new Set([...session.user.permissions, ...sitePerms])
  if (required.every((perm) => combined.has(perm))) {
    return { ok: true, session }
  }

  return { ok: false, reason: 'forbidden' }
}

/** Signed-in, MFA cleared, no particular permission needed. */
export async function requireSession(): Promise<GuardResult> {
  return requirePermission()
}
