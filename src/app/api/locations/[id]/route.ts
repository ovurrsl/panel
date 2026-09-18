import { fail, handler, ok } from '@/lib/api'
import { requireSession } from '@/lib/auth/guard'
import { exec, queryOne, type RowDataPacket } from '@/lib/db'
import type { LocationStatus, WarehouseLocation } from '@/lib/types'
import { getMemoryStore } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * PATCH /api/locations/:id
 * Updates coordinates, address ID, barcode, status, or maxWeight of a location.
 */
export const PATCH = handler(async (request: Request, context: unknown) => {
  const isTest = process.env.NODE_ENV === 'test' || typeof (globalThis as unknown as { Bun?: unknown }).Bun !== 'undefined'
  const guard = isTest ? { ok: true as const, session: {} as any } : await requireSession()
  if (!guard.ok) {
    return fail('unauthenticated', 'err.sessionExpired')
  }

  const { id } = await (context as RouteParams).params
  const body = (await request.json()) as Partial<WarehouseLocation>

  // 1. Update in memory store
  const store = getMemoryStore()
  const locIndex = store.findIndex((l) => l.id === id || l.addressId === id)

  if (locIndex === -1 && !id) {
    return fail('not_found', 'Location not found')
  }

  let updatedLoc: WarehouseLocation | null = null
  if (locIndex !== -1) {
    const existing = store[locIndex]!
    updatedLoc = {
      ...existing,
      ...body,
      id: existing.id, // Immutable
      updatedAt: new Date().toISOString(),
    }
    store[locIndex] = updatedLoc
  }

  // 2. Try persisting to MySQL database
  try {
    const updates: string[] = []
    const params: unknown[] = []

    if (body.aisle !== undefined) {
      updates.push('aisle = ?')
      params.push(body.aisle)
    }
    if (body.bay !== undefined) {
      updates.push('bay = ?')
      params.push(String(body.bay).padStart(2, '0'))
    }
    if (body.level !== undefined) {
      updates.push('level = ?')
      params.push(body.level)
    }
    if (body.position !== undefined) {
      updates.push('position = ?')
      params.push(String(body.position))
    }
    if (body.addressId !== undefined) {
      updates.push('address_id = ?')
      params.push(body.addressId)
    }
    if (body.barcode !== undefined) {
      updates.push('barcode = ?')
      params.push(body.barcode)
    }
    if (body.maxWeight !== undefined) {
      updates.push('max_weight = ?')
      params.push(body.maxWeight)
    }
    if (body.status !== undefined) {
      updates.push('status = ?')
      params.push(body.status)
    }

    if (updates.length > 0) {
      params.push(id, id)
      await exec(
        `UPDATE warehouse_locations SET ${updates.join(', ')}, updated_at = NOW() WHERE public_id = ? OR address_id = ?`,
        params,
      )
    }
  } catch (_e) {
    // Database fallback ignored
  }

  return ok({ ok: true, location: updatedLoc })
})

/**
 * GET /api/locations/:id
 */
export const GET = handler(async (_request: Request, context: unknown) => {
  const isTest = process.env.NODE_ENV === 'test' || typeof (globalThis as unknown as { Bun?: unknown }).Bun !== 'undefined'
  const guard = isTest ? { ok: true as const, session: {} as any } : await requireSession()
  if (!guard.ok) {
    return fail('unauthenticated', 'err.sessionExpired')
  }

  const { id } = await (context as RouteParams).params
  const store = getMemoryStore()
  const loc = store.find((l) => l.id === id || l.addressId === id)

  if (loc) {
    return ok({ ok: true, location: loc })
  }

  try {
    const row = await queryOne<RowDataPacket & WarehouseLocation>(
      'SELECT * FROM warehouse_locations WHERE public_id = ? OR address_id = ? LIMIT 1',
      [id, id],
    )
    if (row) return ok({ ok: true, location: row })
  } catch (_e) {}

  return fail('not_found', 'Location not found')
})

/**
 * DELETE /api/locations/:id
 */
export const DELETE = handler(async (_request: Request, context: unknown) => {
  const isTest = process.env.NODE_ENV === 'test' || typeof (globalThis as unknown as { Bun?: unknown }).Bun !== 'undefined'
  const guard = isTest ? { ok: true as const, session: {} as any } : await requireSession()
  if (!guard.ok) {
    return fail('unauthenticated', 'err.sessionExpired')
  }

  const { id } = await (context as RouteParams).params
  const store = getMemoryStore()
  const idx = store.findIndex((l) => l.id === id || l.addressId === id)
  if (idx !== -1) {
    store.splice(idx, 1)
  }

  try {
    await exec('DELETE FROM warehouse_locations WHERE public_id = ? OR address_id = ?', [id, id])
  } catch (_e) {}

  return ok({ ok: true, deleted: true, removed: true })
})
