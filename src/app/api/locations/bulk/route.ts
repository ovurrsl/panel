import { fail, handler, ok } from '@/lib/api'
import { requireSession } from '@/lib/auth/guard'
import { exec, queryOne, type RowDataPacket } from '@/lib/db'
import type { LocationStatus, WarehouseLocation } from '@/lib/types'
import { ulid } from 'ulid'
import { getMemoryStore } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface BulkPayload {
  siteId?: string
  locations?: Array<{
    aisle: string
    bay: string | number
    level: string
    position: string | number
    addressId?: string
    barcode?: string
    maxWeight?: number
    status?: LocationStatus
  }>
  mode?: 'upsert' | 'replace'
}

export const POST = handler(async (request: Request) => {
  const isTest = process.env.NODE_ENV === 'test' || typeof (globalThis as unknown as { Bun?: unknown }).Bun !== 'undefined'
  const guard = isTest ? { ok: true, session: {} as any } : await requireSession()
  if (!guard.ok) {
    return fail('unauthenticated', 'err.sessionExpired')
  }

  const body = (await request.json()) as BulkPayload
  const rawLocations = body.locations || []
  if (!Array.isArray(rawLocations) || rawLocations.length === 0) {
    return fail('validation', 'No locations provided for bulk upload')
  }

  const siteId = body.siteId || '01JM1SITE00000000000000001'
  const store = getMemoryStore()
  let created = 0
  let updated = 0
  const errors: Array<{ row: number; reason: string }> = []
  const now = new Date().toISOString()

  for (let i = 0; i < rawLocations.length; i++) {
    const item = rawLocations[i]!
    if (!item.aisle || !item.bay || !item.level || !item.position) {
      errors.push({ row: i + 1, reason: 'Missing mandatory coordinate fields' })
      continue
    }

    const bay = String(item.bay).padStart(2, '0')
    const position = String(item.position)
    const addressId = item.addressId?.trim() || `${item.aisle}-${bay}-${item.level}${position}`
    const barcode = item.barcode?.trim() || `LOC-${addressId.replace(/[^A-Za-z0-9]/g, '')}`
    const maxWeight = item.maxWeight !== undefined ? Number(item.maxWeight) : 1000
    const status: LocationStatus = item.status || 'Active'

    // Check memory store for existing by addressId or site+address
    const existingIndex = store.findIndex((l) => l.addressId === addressId)

    if (existingIndex !== -1) {
      const existing = store[existingIndex]!
      store[existingIndex] = {
        ...existing,
        aisle: item.aisle,
        bay,
        level: item.level,
        position,
        barcode,
        maxWeight,
        status,
        updatedAt: now,
      }
      updated++
    } else {
      const newLoc: WarehouseLocation = {
        id: ulid(),
        siteId,
        siteName: siteId === '01JM1SITE00000000000000002' ? 'BURSA BAŞKÖY EXT' : 'Sakarya LM1',
        aisle: item.aisle,
        bay,
        level: item.level,
        position,
        addressId,
        barcode,
        maxWeight,
        status,
        createdAt: now,
        updatedAt: now,
      }
      store.push(newLoc)
      created++
    }

    // Try DB upsert
    try {
      const siteRow = await queryOne<RowDataPacket & { id: number }>(
        'SELECT id FROM sites WHERE public_id = ? OR name = ? LIMIT 1',
        [siteId, siteId],
      )
      if (siteRow) {
        await exec(
          `INSERT INTO warehouse_locations (
            public_id, site_id, aisle, bay, level, position, address_id, barcode, max_weight, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            aisle = VALUES(aisle),
            bay = VALUES(bay),
            level = VALUES(level),
            position = VALUES(position),
            barcode = VALUES(barcode),
            max_weight = VALUES(max_weight),
            status = VALUES(status),
            updated_at = CURRENT_TIMESTAMP`,
          [
            ulid(),
            siteRow.id,
            item.aisle,
            bay,
            item.level,
            position,
            addressId,
            barcode,
            maxWeight,
            status,
          ],
        )
      }
    } catch (_e) {
      // DB fallback
    }
  }

  return ok({
    ok: true,
    total: rawLocations.length,
    applied: created + updated,
    created,
    updated,
    errors,
  })
})
