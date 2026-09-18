import type { LocationStatus, WarehouseLocation } from './types'
import {
  LEVEL_LETTERS,
  levelToLetter,
  letterToLevel,
  type FormatAddressOptions,
  formatIndustrialAddress,
  generateBarcode,
} from './addressing-utils'

export {
  LEVEL_LETTERS,
  levelToLetter,
  letterToLevel,
  type FormatAddressOptions,
  formatIndustrialAddress,
  generateBarcode,
}

// Lazy-load XLSX only when parsing Excel files to keep client components light
let _xlsx: any = null
function getXlsx() {
  if (!_xlsx) {
    try {
      _xlsx = require('xlsx')
    } catch (_e) {
      throw new Error('Package "xlsx" is required to parse Excel spreadsheets.')
    }
  }
  return _xlsx
}

function tryRequire(id: string): any {
  try {
    return require(id)
  } catch {
    return null
  }
}

export interface ParsedAisleRun {
  /** 1-based column index in Excel sheet */
  colIndex: number
  /** Excel column letter (e.g. 'G', 'I', 'AA', 'TCL', 'FY') */
  colLetter: string
  /** Modern aisle designation from Row 5 (e.g. '1L', '06L', 'TCL', 'PL') */
  aisleCode: string
  /** Historical legacy aisle designation from Row 1 (e.g. '1L', '6L', '8L', 'PL') */
  legacyCode: string
  /** Warehouse zone: 'TCA' | 'Ambient' | 'Pet Care' */
  zone: string
  /** Rack structural profile from Row 8 ('A' | 'B' | 'C' | 'D' | 'PL') */
  rackType: string
  /** Number of vertical beam tiers from Row 4 (KAT) */
  levels: number
  /** Number of bay modules from Row 3 (MODÜL) */
  modules: number
  /** Total declared or calculated pallet capacity */
  totalPallets: number
  /** Array of active 1-based bay indices identified in rows 12-43 */
  activeBays: number[]
  /** Pallet slots per beam tier per bay (fixed standard = 3) */
  slotsPerLevel: number
}

export interface SkippedColumn {
  colIndex: number
  colLetter: string
  aisleCode: string
  legacyCode: string
  reason: string
}

export interface ParsedLocation extends WarehouseLocation {
  zoneCode: string
  rackType: string
  bayIndex: number
  levelIndex: number
}

export interface WarehouseLayoutResult {
  sheetName: string
  siteId: string
  siteName: string
  facilityName: string
  runs: ParsedAisleRun[]
  skippedCols: SkippedColumn[]
  totalAisles: number
  totalBays: number
  totalPallets: number
  grossPallets: number
  summaryByZone: Record<string, { runs: number; bays: number; pallets: number }>
  locations: ParsedLocation[]
}

export interface ParseOptions {
  siteId?: string
  siteName?: string
  facilityName?: string
  sheetName?: string
  scanExtendedRows?: boolean
}

export interface ApplyLayoutOptions {
  /** Maximum distance in metres to cluster racks along the X axis (default: 0.5) */
  clusterTolerance?: number
  /** How bayIndex is assigned along Z: 'sequential' (1..N) or 'grid-pitch' (default: 'sequential') */
  bayIndexing?: 'sequential' | 'grid-pitch'
  /** Base Z coordinate for grid-pitch alignment (default: -26.6434) */
  baselineZ?: number
  /** Rack bay pitch in metres for grid-pitch alignment (default: 2.852) */
  bayPitch?: number
  /** Whether to update levels on matching PalletRackNodes (default: true) */
  updateLevels?: boolean
  /** Whether to update zoneCode on matching PalletRackNodes (default: true) */
  updateZoneCode?: boolean
}

export interface ApplyLayoutResult {
  totalRacks: number
  updatedCount: number
  updatedRacks: number
  matchedAisles: number
  matchedLines: number
  unmappedNodes: number
  nodes: any[]
  errors: string[]
}

export interface SeedResult {
  total: number
  created: number
  updated: number
  batches: number
  errors: Array<{ row?: number; reason: string }>
}

/**
 * Builds a column index (1-based) to zone mapping based on merged cells in Row 6.
 */
function getMergedZoneMap(sheet: any): Map<number, string> {
  const XLSX = getXlsx()
  const map = new Map<number, string>()
  const merges = sheet['!merges'] || []
  for (const merge of merges) {
    // Row 6 in 1-based Excel is r = 5 in 0-based SheetJS
    if (merge.s.r <= 5 && 5 <= merge.e.r) {
      const startRef = XLSX.utils.encode_cell({ c: merge.s.c, r: merge.s.r })
      const val = sheet[startRef]?.v
      if (val) {
        const text = String(val).trim()
        for (let c = merge.s.c; c <= merge.e.c; c++) {
          map.set(c + 1, text)
        }
      }
    }
  }
  return map
}

/**
 * Resolves warehouse zone considering merged cells and physical layout boundaries.
 */
function resolveZone(col1Based: number, directZoneVal?: string, mergedMap?: Map<number, string>): string {
  if (directZoneVal && directZoneVal.trim()) return directZoneVal.trim()
  if (mergedMap && mergedMap.has(col1Based)) return mergedMap.get(col1Based)!

  // Boundary fallbacks based on physical Bursa layout:
  // Cols 7 (PL) to 35 (TCR): TCA (Temperature Controlled Area)
  if (col1Based >= 7 && col1Based <= 35) return 'TCA'
  // Cols 107 (DC) to 146 (EP): Pet Care
  if (col1Based >= 107 && col1Based <= 146) return 'Pet Care'
  // All other aisles: Ambient
  return 'Ambient'
}

/**
 * Parses a SheetJS worksheet into a structured WarehouseLayoutResult.
 */
export function parseWarehouseWorksheet(
  worksheet: any,
  options: ParseOptions = {}
): WarehouseLayoutResult {
  const XLSX = getXlsx()
  const siteId = options.siteId ?? '01JM1SITE00000000000000001'
  const siteName = options.siteName ?? 'Bursa Depo'
  const facilityName = options.facilityName ?? 'Bursa'
  const sheetName = options.sheetName ?? 'Sayfa1'

  const ref = worksheet['!ref']
  if (!ref) {
    throw new Error('Worksheet contains no cell reference range (!ref is undefined)')
  }

  const range = XLSX.utils.decode_range(ref)
  const mergedZoneMap = getMergedZoneMap(worksheet)

  const runs: ParsedAisleRun[] = []
  const skippedCols: SkippedColumn[] = []

  const getCellVal = (c0: number, r0: number): any => {
    const cellRef = XLSX.utils.encode_cell({ c: c0, r: r0 })
    return worksheet[cellRef]?.v ?? null
  }

  // Row 2 Gross capacity check from Cell E2 (c: 4, r: 1)
  let grossPallets = 0
  const e2Val = getCellVal(4, 1)
  if (typeof e2Val === 'number') {
    grossPallets = e2Val
  }

  for (let c0 = range.s.c; c0 <= range.e.c; c0++) {
    const colIndex = c0 + 1
    const colLetter = XLSX.utils.encode_col(c0)

    const r1 = getCellVal(c0, 0) // Row 1: Legacy Code
    const r2 = getCellVal(c0, 1) // Row 2: Pallet count
    const r3 = getCellVal(c0, 2) // Row 3: Module count
    const r4 = getCellVal(c0, 3) // Row 4: KAT / Levels
    const r5 = getCellVal(c0, 4) // Row 5: Modern Code
    const r6 = getCellVal(c0, 5) // Row 6: Zone
    const r8 = getCellVal(c0, 7) // Row 8: Rack Type

    const legacyCode = r1 !== null && r1 !== undefined ? String(r1).trim() : ''
    const modernCode = r5 !== null && r5 !== undefined ? String(r5).trim() : ''

    // Skip non-rack columns (e.g. summary cols A-E, header label Col F)
    if (
      colIndex < 7 ||
      modernCode === 'Yeni Kodlama' ||
      legacyCode === 'Eski Kodlama' ||
      ['TCA', 'Ambient', 'Brüt'].includes(legacyCode)
    ) {
      continue
    }

    // Special Handling for PL Column (Col G, index 7 or legacyCode === 'PL')
    if (colIndex === 7 || legacyCode === 'PL' || modernCode === 'PL') {
      const modules = typeof r3 === 'number' ? r3 : parseInt(String(r3), 10) || 6
      const levels = typeof r4 === 'number' ? r4 : parseInt(String(r4), 10) || 7
      const totalPallets = typeof r2 === 'number' ? r2 : modules * levels * 3
      const activeBays = Array.from({ length: modules }, (_, i) => i + 1)

      runs.push({
        colIndex,
        colLetter,
        aisleCode: 'PL',
        legacyCode: 'PL',
        zone: 'TCA',
        rackType: 'PL',
        levels,
        modules,
        totalPallets,
        activeBays,
        slotsPerLevel: 3,
      })
      continue
    }

    // Standard Aisle Column Check: must have modernCode or legacyCode
    if (!modernCode && !legacyCode) {
      continue
    }

    // Scan Matrix Rows 12 to 43 (r: 11 to 42)
    const activeBays: number[] = []

    // Check optional extended rows 10-11 for Column Y (5R)
    if (options.scanExtendedRows && colLetter === 'Y') {
      if (getCellVal(c0, 9) !== null) activeBays.push(33)
      if (getCellVal(c0, 10) !== null) activeBays.push(34)
    }

    for (let r0 = 11; r0 <= Math.min(42, range.e.r); r0++) {
      const val = getCellVal(c0, r0)
      if (val !== null && val !== undefined && String(val).trim() !== '') {
        const bayIndex = r0 - 10 // Row 12 (r0: 11) -> Bay 1; Row 43 (r0: 42) -> Bay 32
        activeBays.push(bayIndex)
      }
    }

    activeBays.sort((a, b) => a - b)

    // Filter out non-active columns (e.g. CX and CY where activeBays == 0)
    if (activeBays.length === 0) {
      skippedCols.push({
        colIndex,
        colLetter,
        aisleCode: modernCode || legacyCode,
        legacyCode,
        reason: 'No active bays in matrix rows 12-43 (activeBays == 0)',
      })
      continue
    }

    const levels = typeof r4 === 'number' ? r4 : parseInt(String(r4), 10) || 6
    const modules = typeof r3 === 'number' ? r3 : activeBays.length
    const calculatedPallets = activeBays.length * levels * 3
    const totalPallets = typeof r2 === 'number' ? r2 : calculatedPallets
    const zone = resolveZone(
      colIndex,
      r6 !== null && r6 !== undefined ? String(r6).trim() : undefined,
      mergedZoneMap
    )
    const rackType = r8 !== null && r8 !== undefined && String(r8).trim() ? String(r8).trim() : 'A'

    runs.push({
      colIndex,
      colLetter,
      aisleCode: modernCode || legacyCode,
      legacyCode,
      zone,
      rackType,
      levels,
      modules,
      totalPallets,
      activeBays,
      slotsPerLevel: 3,
    })
  }

  const totalAisles = runs.length
  let totalBays = 0
  let totalPallets = 0
  const summaryByZone: Record<string, { runs: number; bays: number; pallets: number }> = {}

  for (const run of runs) {
    totalBays += run.activeBays.length
    totalPallets += run.totalPallets
    let zoneSummary = summaryByZone[run.zone]
    if (!zoneSummary) {
      zoneSummary = { runs: 0, bays: 0, pallets: 0 }
      summaryByZone[run.zone] = zoneSummary
    }
    zoneSummary.runs += 1
    zoneSummary.bays += run.activeBays.length
    zoneSummary.pallets += run.totalPallets
  }

  if (grossPallets === 0) {
    grossPallets = totalPallets + skippedCols.reduce((acc) => acc + 72, 0)
  }

  const result: WarehouseLayoutResult = {
    sheetName,
    siteId,
    siteName,
    facilityName,
    runs,
    skippedCols,
    totalAisles,
    totalBays,
    totalPallets,
    grossPallets,
    summaryByZone,
    locations: [],
  }

  result.locations = generateLocationsFromLayout(result, { siteId, siteName })
  return result
}

/**
 * Parses warehouse layout from a local file path.
 */
export function parseWarehouseExcel(filePath: string, options: ParseOptions = {}): WarehouseLayoutResult {
  const XLSX = getXlsx()
  const fs = require('node:fs')
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath} (ENOENT)`)
  }

  let workbook: any
  try {
    workbook = XLSX.readFile(filePath)
  } catch (e: any) {
    throw new Error(`Failed to read Excel file at ${filePath}: ${e?.message ?? 'unknown error'}`)
  }

  const targetSheet = options.sheetName ?? 'Sayfa1'
  const worksheet = workbook.Sheets[targetSheet]
  if (!worksheet) {
    throw new Error(`Worksheet '${targetSheet}' not found in workbook: ${filePath}`)
  }

  return parseWarehouseWorksheet(worksheet, { ...options, sheetName: targetSheet })
}

/**
 * Parses warehouse layout from an in-memory buffer or Uint8Array.
 */
export function parseWarehouseExcelBuffer(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  options: ParseOptions = {}
): WarehouseLayoutResult {
  const XLSX = getXlsx()
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as any)
  if (!buf || buf.length < 4) {
    throw new Error('Invalid buffer or unsupported file: corrupt or empty buffer')
  }

  // Check Excel signature (PK\x03\x04 for ZIP/XLSX or \xD0\xCF\x11\xE0 for OLE2/XLS)
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b
  const isOle = buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0
  if (!isZip && !isOle) {
    throw new Error('Invalid buffer or unsupported file: corrupt or unrecognized Excel format')
  }

  let workbook: any
  try {
    workbook = XLSX.read(buf, { type: 'buffer' })
  } catch (e: any) {
    throw new Error(`Invalid or corrupt Excel buffer: ${e?.message ?? 'unsupported file'}`)
  }

  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Invalid buffer or unsupported file: no worksheets found')
  }

  const targetSheet = options.sheetName ?? 'Sayfa1'
  const worksheet = workbook.Sheets[targetSheet]
  if (!worksheet) {
    throw new Error(`Worksheet '${targetSheet}' not found in provided workbook buffer`)
  }

  return parseWarehouseWorksheet(worksheet, { ...options, sheetName: targetSheet })
}

/** Alias for parseWarehouseExcelBuffer */
export const parseWarehouseExcelFromBuffer = parseWarehouseExcelBuffer

/**
 * Generates discrete WarehouseLocation slot records from parsed layout runs.
 */
export function generateLocationsFromLayout(
  layout: WarehouseLayoutResult,
  options: { siteId?: string; siteName?: string } = {}
): ParsedLocation[] {
  const siteId = options.siteId ?? layout.siteId
  const siteName = options.siteName ?? layout.siteName
  const locations: ParsedLocation[] = []
  const now = new Date().toISOString()

  for (const run of layout.runs) {
    for (const bayIndex of run.activeBays) {
      const bayStr = String(bayIndex).padStart(2, '0')
      for (let levelIdx = 0; levelIdx < run.levels; levelIdx++) {
        const levelChar = levelToLetter(levelIdx)
        for (let pos = 1; pos <= run.slotsPerLevel; pos++) {
          const posStr = String(pos)
          const addressId = formatIndustrialAddress(run.aisleCode, bayStr, levelChar, posStr)
          const barcode = generateBarcode(addressId)

          locations.push({
            id: `loc_${addressId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
            siteId,
            siteName,
            aisle: run.aisleCode,
            bay: bayStr,
            level: levelChar,
            position: posStr,
            addressId,
            barcode,
            maxWeight: 1000,
            status: 'Active',
            zoneCode: run.zone,
            rackType: run.rackType,
            bayIndex,
            levelIndex: levelIdx,
            createdAt: now,
            updatedAt: now,
          })
        }
      }
    }
  }

  return locations
}

/**
 * Applies the parsed Excel layout to scene graph nodes, assigning rowLabel, bayIndex, zoneCode, and levels.
 */
export function applyExcelLayoutToScene(
  sceneGraphOrNodes: any,
  layout: WarehouseLayoutResult,
  options: ApplyLayoutOptions = {}
): ApplyLayoutResult {
  const {
    clusterTolerance = 0.5,
    bayIndexing = 'sequential',
    baselineZ = -26.6434,
    bayPitch = 2.852,
    updateLevels = true,
    updateZoneCode = true,
  } = options

  const errors: string[] = []

  let allNodes: any[] = []
  if (Array.isArray(sceneGraphOrNodes)) {
    allNodes = sceneGraphOrNodes
  } else if (sceneGraphOrNodes && typeof sceneGraphOrNodes === 'object') {
    if (sceneGraphOrNodes.nodes) {
      allNodes = Array.isArray(sceneGraphOrNodes.nodes)
        ? sceneGraphOrNodes.nodes
        : Object.values(sceneGraphOrNodes.nodes)
    } else {
      allNodes = Object.values(sceneGraphOrNodes)
    }
  }

  const rackNodes = allNodes.filter(
    (n) => n && (n.type === 'warehouse:pallet-rack' || n.kind === 'warehouse:pallet-rack')
  )

  // 1. Separate transverse PL racks (rotation ~ 0 or 2*PI rad, vs ~ 4.71 rad for parallel racks)
  const plRacks = rackNodes.filter((r) => {
    const rotY = Math.abs(r.rotation?.[1] || 0)
    return Math.abs(rotY - 4.71238898) > 0.5
  })

  // 2. Parallel racks (running along Z axis)
  const parallelRacks = rackNodes.filter((r) => !plRacks.includes(r))

  let updatedCount = 0
  let matchedAisles = 0

  // 3. Map PL racks
  const plRun = layout.runs.find((r) => r.aisleCode === 'PL' || r.legacyCode === 'PL')
  if (plRun && plRacks.length > 0) {
    plRacks.sort((a, b) => (a.position?.[0] || 0) - (b.position?.[0] || 0))
    plRacks.forEach((rack, idx) => {
      rack.rowLabel = plRun.aisleCode
      rack.bayIndex = idx + 1
      if (updateLevels) rack.levels = plRun.levels
      if (updateZoneCode) rack.zoneCode = plRun.zone || 'TCA'
      rack.accessMode = 'single-face'
      rack.frontAisleLabel = plRun.aisleCode
      updatedCount++
    })
    matchedAisles++
  }

  // 4. Cluster parallel racks along X axis
  const sortedByX = [...parallelRacks].sort((a, b) => (a.position?.[0] || 0) - (b.position?.[0] || 0))
  const clusters: Array<{ meanX: number; racks: any[] }> = []

  for (const rack of sortedByX) {
    const x = rack.position?.[0] || 0
    const lastCluster = clusters[clusters.length - 1]
    if (!lastCluster || Math.abs(x - lastCluster.meanX) > clusterTolerance) {
      clusters.push({ meanX: x, racks: [rack] })
    } else {
      lastCluster.racks.push(rack)
      lastCluster.meanX =
        lastCluster.racks.reduce((s, r) => s + (r.position?.[0] || 0), 0) / lastCluster.racks.length
    }
  }

  const activeParallelRuns = layout.runs.filter((r) => r.aisleCode !== 'PL' && r.legacyCode !== 'PL')
  const lineCount = Math.min(clusters.length, activeParallelRuns.length)

  for (let i = 0; i < lineCount; i++) {
    const run = activeParallelRuns[i]!
    const cluster = clusters[i]!

    // Sort racks along Z coordinate (South to North)
    cluster.racks.sort((a, b) => (a.position?.[2] || 0) - (b.position?.[2] || 0))

    cluster.racks.forEach((rack, idx) => {
      rack.rowLabel = run.aisleCode
      if (bayIndexing === 'grid-pitch') {
        const exactBay = ((rack.position?.[2] || 0) - baselineZ) / bayPitch + 1
        rack.bayIndex = Math.max(1, Math.round(exactBay))
      } else {
        rack.bayIndex = idx + 1
      }
      if (updateLevels) rack.levels = run.levels
      if (updateZoneCode) rack.zoneCode = run.zone
      rack.accessMode = 'single-face'
      rack.frontAisleLabel = run.aisleCode
      updatedCount++
    })
    matchedAisles++
  }

  const unmappedNodes = rackNodes.length - updatedCount

  return {
    totalRacks: rackNodes.length,
    updatedCount,
    updatedRacks: updatedCount,
    matchedAisles,
    matchedLines: matchedAisles,
    unmappedNodes,
    nodes: rackNodes,
    errors,
  }
}

/**
 * Seeds or updates locations in batches of 1,000 via bulk POST API handler or memory store.
 */
export async function seedLocationsFromExcel(
  layoutOrLocations: WarehouseLayoutResult | any[],
  siteId: string = '01JM1SITE00000000000000001',
  bulkPostFnOrOptions?: any
): Promise<SeedResult> {
  let locations: any[] = []

  if (Array.isArray(layoutOrLocations)) {
    locations = layoutOrLocations
  } else if (layoutOrLocations && typeof layoutOrLocations === 'object') {
    if (layoutOrLocations.locations && layoutOrLocations.locations.length > 0) {
      locations = layoutOrLocations.locations
    } else {
      locations = generateLocationsFromLayout(layoutOrLocations, { siteId })
    }
  }

  const BATCH_SIZE = 1000
  let created = 0
  let updated = 0
  let batches = 0
  const allErrors: Array<{ row?: number; reason: string }> = []

  const bulkPostFn =
    typeof bulkPostFnOrOptions === 'function' ? bulkPostFnOrOptions : bulkPostFnOrOptions?.bulkPostFn

  for (let i = 0; i < locations.length; i += BATCH_SIZE) {
    const chunk = locations.slice(i, i + BATCH_SIZE)
    batches++

    if (bulkPostFn) {
      const res = await bulkPostFn({ siteId, locations: chunk, mode: 'upsert' })
      if (res) {
        created += res.created ?? res.data?.created ?? 0
        updated += res.updated ?? res.data?.updated ?? 0
        if (res.errors) allErrors.push(...res.errors)
      }
    } else {
      let handled = false
      if (typeof window === 'undefined') {
        try {
          const mod =
            tryRequire('../../../app/api/locations/route') ||
            tryRequire('../../app/api/locations/route') ||
            tryRequire('@/app/api/locations/route')
          if (mod?.getMemoryStore) {
            const store = mod.getMemoryStore()
            for (const loc of chunk) {
              const existingIdx = store.findIndex((l: any) => l.addressId === loc.addressId)
              if (existingIdx !== -1) {
                store[existingIdx] = { ...store[existingIdx], ...loc }
                updated++
              } else {
                store.push(loc)
                created++
              }
            }
            handled = true
          }
        } catch (_e) {}
      }

      if (!handled && typeof fetch === 'function') {
        try {
          const response = await fetch('/api/locations/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ siteId, locations: chunk, mode: 'upsert' }),
          })
          if (response.ok) {
            const data = await response.json()
            created += data.created || 0
            updated += data.updated || 0
            if (data.errors) allErrors.push(...data.errors)
          }
        } catch (fetchErr: any) {
          allErrors.push({ reason: `Fetch error: ${fetchErr?.message}` })
        }
      }
    }
  }

  return {
    total: locations.length,
    created,
    updated,
    batches,
    errors: allErrors,
  }
}
