'use client'

import { useApp } from '@/components/app-providers'
import { Toast } from '@/components/ui/feedback'
import type { SitesResponse } from '@/lib/api-contract'
import { call } from '@/lib/client-api'
import { cn } from '@/lib/cn'
import { useEscapeLayer } from '@/lib/escape-layers'
import type { LocationStatus, WarehouseLocation } from '@/lib/types'
import { Interactive2DCanvas } from '@/components/console/interactive-2d-canvas'
import {
  RackPropertyEditorCard,
  type PalletRackNodeShape,
} from '@/components/console/rack-property-editor-card'
import { formatIndustrialAddress, generateBarcode } from '@/lib/addressing-utils'
type PalletRackNode = PalletRackNodeShape
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const ROW_HEIGHT = 36
const OVERSCAN = 6

const LEVEL_COLORS: Record<string, string> = {
  A: '#FACC15', // Yellow
  B: '#2563EB', // Blue
  C: '#DC2626', // Red
  D: '#16A34A', // Green
  E: '#18181B', // Black
  F: '#9333EA', // Purple
}

function getLevelColor(letter: string): string {
  return LEVEL_COLORS[letter?.toUpperCase()] ?? '#64748B'
}

export function exportLocationsToCsv(locations: WarehouseLocation[], filename = 'warehouse-locations.csv') {
  const headers = ['Aisle', 'Bay', 'Level', 'Position', 'Address ID', 'Barcode', 'Max Weight (kg)', 'Status']
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return ''
    const str = String(val)
    if (/[",\r\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [
    headers.join(','),
    ...locations.map((loc) =>
      [
        escapeCell(loc.aisle),
        escapeCell(loc.bay),
        escapeCell(loc.level),
        escapeCell(loc.position),
        escapeCell(loc.addressId),
        escapeCell(loc.barcode),
        escapeCell(loc.maxWeight),
        escapeCell(loc.status),
      ].join(','),
    ),
  ]

  // Prepend \uFEFF UTF-8 BOM so Excel opens Turkish characters cleanly
  const csvContent = `\uFEFF${lines.join('\r\n')}`
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function parseRfc4180Csv(csvText: string): { rows: Array<Partial<WarehouseLocation>>; errors: string[] } {
  let text = csvText.startsWith('\uFEFF') ? csvText.slice(1) : csvText
  const records: string[][] = []
  let currentRecord: string[] = []
  let currentField = ''
  let insideQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"'
          i++
        } else {
          insideQuotes = false
        }
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        insideQuotes = true
      } else if (char === ',') {
        currentRecord.push(currentField.trim())
        currentField = ''
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && nextChar === '\n') i++
        currentRecord.push(currentField.trim())
        currentField = ''
        if (currentRecord.length > 0 && (currentRecord.length > 1 || currentRecord[0] !== '')) {
          records.push(currentRecord)
        }
        currentRecord = []
      } else {
        currentField += char
      }
    }
  }

  if (currentField || currentRecord.length > 0) {
    currentRecord.push(currentField.trim())
    records.push(currentRecord)
  }

  if (records.length < 2) {
    return { rows: [], errors: ['CSV file is empty or missing data rows.'] }
  }

  const firstRow = records[0]
  if (!firstRow) {
    return { rows: [], errors: ['CSV file is empty or missing data rows.'] }
  }

  const rawHeaders = firstRow.map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''))
  const headerMap: Record<string, number> = {}
  rawHeaders.forEach((h, idx) => {
    headerMap[h] = idx
  })

  const getIdx = (...aliases: string[]) => {
    for (const a of aliases) {
      if (headerMap[a] !== undefined) return headerMap[a]
    }
    return -1
  }

  const aisleIdx = getIdx('aisle', 'row', 'sira')
  const bayIdx = getIdx('bay', 'goz')
  const levelIdx = getIdx('level', 'lvl', 'kat')
  const posIdx = getIdx('position', 'pos', 'konum')
  const addrIdx = getIdx('addressid', 'address', 'code', 'adres', 'adreskodu')
  const barcodeIdx = getIdx('barcode', 'barkod')
  const weightIdx = getIdx('maxweight', 'maxweightkg', 'weight', 'capacity', 'agirlik')
  const statusIdx = getIdx('status', 'durum')

  if (aisleIdx === -1 || bayIdx === -1) {
    return { rows: [], errors: ['Missing required columns: Aisle and Bay are mandatory.'] }
  }

  const rows: Array<Partial<WarehouseLocation>> = []
  const errors: string[] = []

  for (let r = 1; r < records.length; r++) {
    const rec = records[r]
    if (!rec || rec.every((c) => !c)) continue

    const aisle = (aisleIdx !== -1 ? rec[aisleIdx] : '') ?? ''
    const rawBay = (bayIdx !== -1 ? rec[bayIdx] : '1') ?? '1'
    const bay = String(parseInt(rawBay, 10) || 1).padStart(2, '0')
    const level = ((levelIdx !== -1 ? rec[levelIdx] : 'A') || 'A') ?? 'A'
    const position = posIdx !== -1 && rec[posIdx] ? String(parseInt(rec[posIdx] ?? '1', 10) || 1) : '1'

    let addressId = addrIdx !== -1 && rec[addrIdx] ? rec[addrIdx] : ''
    if (!addressId) {
      addressId = `${aisle}-${bay}-${level}${position}`
    }

    let barcode = barcodeIdx !== -1 && rec[barcodeIdx] ? rec[barcodeIdx] : ''
    if (!barcode) {
      barcode = `LOC-${addressId.replace(/[^A-Za-z0-9]/g, '')}`
    }

    const maxWeight = weightIdx !== -1 && rec[weightIdx] ? parseInt(rec[weightIdx] ?? '1000', 10) || 1000 : 1000

    let status: LocationStatus = 'Active'
    const statusVal = statusIdx !== -1 ? rec[statusIdx] : undefined
    if (statusVal) {
      const s = statusVal.toLowerCase()
      if (s.includes('block') || s.includes('bloke')) status = 'Blocked'
      else if (s.includes('quar') || s.includes('karantina')) status = 'Quarantine'
    }

    if (!aisle) {
      errors.push(`Row ${r + 1}: Missing Aisle identifier.`)
      continue
    }

    rows.push({ aisle, bay, level, position, addressId, barcode, maxWeight, status })
  }

  return { rows, errors }
}

interface EditDraft {
  addressId: string
  barcode: string
  maxWeight: number
  status: LocationStatus
}

/**
 * Synthesizes PalletRackNode entities from existing locations if site has no saved 3D scene.
 * Guarantees that the 2D canvas always renders interactive bays with 100% fidelity.
 */
export function synthesizeSceneFromLocations(
  locations: WarehouseLocation[],
): Record<string, PalletRackNodeShape> {
  const nodes: Record<string, PalletRackNodeShape> = {}
  const aisleBayMap = new Map<string, WarehouseLocation[]>()

  for (const loc of locations) {
    const key = `${loc.aisle.trim().toUpperCase()}__${String(loc.bay).padStart(2, '0')}`
    const list = aisleBayMap.get(key) ?? []
    list.push(loc)
    aisleBayMap.set(key, list)
  }

  const distinctAisles = Array.from(new Set(locations.map((l) => l.aisle.trim().toUpperCase()))).sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
  )
  const aisleSpacing = 4.0
  const bayPitch = 2.8

  for (const [key, locs] of aisleBayMap.entries()) {
    const parts = key.split('__')
    const aisle = parts[0] ?? 'A'
    const bayStr = parts[1] ?? '01'
    const bayIndex = parseInt(bayStr, 10) || 1
    const aisleIndex = Math.max(0, distinctAisles.indexOf(aisle))
    const firstLoc = locs[0]
    const nodeId = firstLoc?.nodeId || `pallet-rack-${aisle}-${bayStr}`

    // Compute distinct levels and positions from data
    const distinctLevels = new Set(locs.map((l) => l.level.toUpperCase()))
    const distinctPositions = new Set(locs.map((l) => String(l.position)))
    const levelCount = Math.max(1, distinctLevels.size)
    const palletsPerLevel = Math.min(3, Math.max(1, distinctPositions.size || 3))
    const bayClearWidth = palletsPerLevel === 1 ? 1.1 : palletsPerLevel === 2 ? 2.3 : 2.73

    const posX = (bayIndex - 1) * bayPitch
    const posZ = aisleIndex * aisleSpacing

    nodes[nodeId] = {
      id: nodeId,
      type: 'warehouse:pallet-rack',
      position: [posX, 0, posZ],
      rotation: [0, 0, 0],
      rowLabel: aisle,
      bayIndex,
      zoneCode: firstLoc?.zoneCode || '',
      accessMode: 'single-face',
      frontAisleLabel: aisle,
      rearAisleLabel: '',
      namingStrategy: 'aisle-pairs',
      signMountStyle: 'flag',
      levels: levelCount,
      palletsPerLevel,
      bayClearWidth,
      depth: 1.1,
      uprightHeight: Math.max(5, levelCount * 1.8),
    }
  }

  return nodes
}

export function AddressesTab() {
  const { t } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  // Sites state
  const [sites, setSites] = useState<Array<{ id: string; name: string; sceneId?: string | null }>>([
    { id: '01JM1SITE00000000000000002', name: 'BURSA BAŞKÖY EXT', sceneId: 'bursa_baskoy' },
    { id: '01JM1SITE00000000000000001', name: 'Sakarya LM1', sceneId: 'sakarya_lm1' },
  ])
  const [selectedSiteId, setSelectedSiteId] = useState<string>('01JM1SITE00000000000000002')
  const selectedSite = useMemo(() => sites.find((s) => s.id === selectedSiteId), [sites, selectedSiteId])

  // Locations state
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(true)
  const isFirstLoad = useRef(true)
  const loadSeqRef = useRef(0)
  const locationsCountRef = useRef(0)
  useEffect(() => {
    locationsCountRef.current = locations.length
  }, [locations.length])

  // 2D Canvas and Rack Selection State
  const [selectedRackNode, setSelectedRackNode] = useState<PalletRackNodeShape | null>(null)
  const [sceneNodes, setSceneNodes] = useState<Record<string, PalletRackNodeShape>>({})
  const [loadingScene, setLoadingScene] = useState(false)

  // Compute effective scene
  const effectiveSceneNodes = useMemo(() => {
    if (Object.keys(sceneNodes).length > 0) return sceneNodes
    return synthesizeSceneFromLocations(locations)
  }, [sceneNodes, locations])

  const previewScene = useMemo(() => {
    return { nodes: effectiveSceneNodes }
  }, [effectiveSceneNodes])

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [aisleFilter, setAisleFilter] = useState<string>('All')
  const [bayFilter, setBayFilter] = useState<string | null>(null)

  // Multi-selection & Batch Operations State
  const [selectedRackIds, setSelectedRackIds] = useState<string[]>([])
  const [showClearAllModal, setShowClearAllModal] = useState(false)
  const [clearingAll, setClearingAll] = useState(false)
  const [rowNamingModal, setRowNamingModal] = useState<{
    isOpen: boolean
    newAisleName: string
    startBay: number
    levels: number
    palletsPerLevel: number
  }>({
    isOpen: false,
    newAisleName: '01L',
    startBay: 1,
    levels: 5,
    palletsPerLevel: 3,
  })

  // Selection state
  const [selectedLocation, setSelectedLocation] = useState<WarehouseLocation | null>(null)

  // Inline editing state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)

  // Virtualization state
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(500)

  // Toast state
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null)

  const notify = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone })
    setTimeout(() => setToast(null), 3000)
  }, [])

  // Escape key cancels inline editing
  useEscapeLayer(Boolean(editingId), () => {
    setEditingId(null)
    setEditDraft(null)
  })

  // Measure viewport on mount and resize
  useEffect(() => {
    if (!gridContainerRef.current) return
    const updateHeight = () => {
      if (gridContainerRef.current) {
        setViewportHeight(gridContainerRef.current.clientHeight || 500)
      }
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  // Fetch sites once on mount, normalizing Bursa and Sakarya canonical IDs
  useEffect(() => {
    let active = true
    async function loadSites() {
      try {
        const res = await call<SitesResponse>('/api/sites')
        if (active && res.ok && res.data.sites && res.data.sites.length > 0) {
          const normalizedSites = res.data.sites.map((s) => {
            const isBursa = s.id === '01JM1SITE00000000000000002' || s.name.toUpperCase().includes('BURSA')
            const isSakarya = s.id === '01JM1SITE00000000000000001' || s.name.toUpperCase().includes('SAKARYA')
            return {
              ...s,
              id: isBursa ? '01JM1SITE00000000000000002' : isSakarya ? '01JM1SITE00000000000000001' : s.id,
              sceneId: s.sceneId || (isBursa ? 'bursa_baskoy' : isSakarya ? 'sakarya_lm1' : null),
            }
          })
          setSites(normalizedSites)

          const bursaSite = normalizedSites.find(
            (s) => s.id === '01JM1SITE00000000000000002' || s.name.toUpperCase().includes('BURSA'),
          )
          const defaultTarget = bursaSite || normalizedSites[0]
          if (defaultTarget) {
            setSelectedSiteId((current) => {
              if (normalizedSites.some((s) => s.id === current)) return current
              return defaultTarget.id
            })
          }
        }
      } catch (_e) {
        // Ignored
      }
    }
    void loadSites()
    return () => {
      active = false
    }
  }, [])

  // Fetch locations with race-condition guards and zero-flicker state
  const loadLocations = useCallback(async (siteTarget?: string) => {
    const activeSite = siteTarget || selectedSiteId
    const seq = ++loadSeqRef.current

    // Only unmount to spinner on very first load before we have any locations
    if (isFirstLoad.current && locationsCountRef.current === 0) {
      setLoading(true)
    }

    try {
      const res = await call<{
        locations: WarehouseLocation[]
        total: number
        canEdit?: boolean
      }>(`/api/locations?siteId=${encodeURIComponent(activeSite)}`)

      // If a newer request was dispatched, drop this stale response
      if (seq !== loadSeqRef.current) return

      if (res.ok) {
        const incoming = res.data.locations || []
        setLocations(incoming)
        if (res.data.canEdit !== undefined) setCanEdit(res.data.canEdit)
        isFirstLoad.current = false
      } else {
        notify('Failed to load locations', 'error')
      }
    } catch (_e) {
      if (seq === loadSeqRef.current) {
        notify('Failed to load locations', 'error')
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false)
        isFirstLoad.current = false
      }
    }
  }, [selectedSiteId, notify])

  useEffect(() => {
    void loadLocations()
  }, [loadLocations])

  // Distinct aisles for dropdown (natural sort)
  const distinctAisles = useMemo(() => {
    const set = new Set<string>()
    for (const loc of locations) {
      if (loc.aisle) set.add(loc.aisle)
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    )
  }, [locations])

  // Load site scene if available
  useEffect(() => {
    let active = true
    async function loadSiteScene() {
      const currentSite = sites.find((s) => s.id === selectedSiteId)
      if (!currentSite?.sceneId) {
        setSceneNodes({})
        return
      }
      setLoadingScene(true)
      try {
        const res = await call<{
          graph?: { nodes?: Record<string, PalletRackNodeShape> }
          nodes?: Record<string, PalletRackNodeShape>
        }>(`/api/scenes/${currentSite.sceneId}`)
        if (active && res.ok && res.data) {
          const rawNodes = res.data.graph?.nodes ?? res.data.nodes ?? {}
          setSceneNodes(rawNodes)
        }
      } catch (_e) {
        // Fallback to synthesized scene
      } finally {
        if (active) setLoadingScene(false)
      }
    }
    void loadSiteScene()
    return () => {
      active = false
    }
  }, [selectedSiteId, sites])

  // Real-time incoming synchronization listener from 3D Viewer & plugin-warehouse
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleIncomingSync = (payload: any) => {
      if (!payload || typeof payload !== 'object') return
      if (payload.type === 'RACK_LABEL_UPDATED' && payload.rackId) {
        setSceneNodes((prev) => {
          const current = prev[payload.rackId]
          if (!current) return prev
          return {
            ...prev,
            [payload.rackId]: {
              ...current,
              rowLabel: payload.rowLabel ?? current.rowLabel,
              bayIndex: payload.bayIndex ?? current.bayIndex,
              frontAisleLabel: payload.frontAisleLabel ?? current.frontAisleLabel,
              rearAisleLabel: payload.rearAisleLabel ?? current.rearAisleLabel,
              zoneCode: payload.zoneCode ?? current.zoneCode,
            },
          }
        })
      }
    }

    try {
      const bc = new BroadcastChannel('dt_warehouse_sync')
      bc.onmessage = (e) => handleIncomingSync(e.data)
      const onWinSync = (e: any) => handleIncomingSync(e.detail)
      window.addEventListener('dt_warehouse_sync', onWinSync)
      return () => {
        bc.close()
        window.removeEventListener('dt_warehouse_sync', onWinSync)
      }
    } catch (_e) {}
  }, [])

  // Multi-column filtering & Natural Sorting
  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result = locations.filter((loc) => {
      if (statusFilter !== 'All' && loc.status !== statusFilter) return false
      if (aisleFilter !== 'All' && loc.aisle.toLowerCase() !== aisleFilter.toLowerCase()) return false
      if (bayFilter && String(loc.bay).padStart(2, '0') !== String(bayFilter).padStart(2, '0')) return false

      if (!q) return true
      return (
        loc.addressId.toLowerCase().includes(q) ||
        loc.barcode.toLowerCase().includes(q) ||
        loc.aisle.toLowerCase().includes(q) ||
        String(loc.bay).includes(q)
      )
    })

    // Natural sort: Aisle (1L, 1R, 2L...), Bay (01, 02...), Level (A, B...), Position (1, 2, 3)
    return result.sort((a, b) => {
      if (a.aisle !== b.aisle) {
        const aisleCmp = a.aisle.localeCompare(b.aisle, undefined, { numeric: true, sensitivity: 'base' })
        if (aisleCmp !== 0) return aisleCmp
      }
      const bayA = parseInt(String(a.bay), 10) || 0
      const bayB = parseInt(String(b.bay), 10) || 0
      if (bayA !== bayB) return bayA - bayB
      if (a.level !== b.level) {
        const lvlCmp = a.level.localeCompare(b.level)
        if (lvlCmp !== 0) return lvlCmp
      }
      const posA = parseInt(String(a.position), 10) || 0
      const posB = parseInt(String(b.position), 10) || 0
      return posA - posB
    })
  }, [locations, search, statusFilter, aisleFilter, bayFilter])

  // Virtualization windowing calculations
  const totalCount = filteredLocations.length
  const totalHeight = totalCount * ROW_HEIGHT
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex = Math.min(totalCount, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN)
  const visibleRows = useMemo(() => {
    return filteredLocations.slice(startIndex, endIndex)
  }, [filteredLocations, startIndex, endIndex])
  const offsetY = startIndex * ROW_HEIGHT

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  // 2D Canvas -> Grid Selection Handler
  const handleSelectRackFromCanvas = useCallback(
    (rack: PalletRackNodeShape | PalletRackNode | null) => {
      setSelectedRackNode(rack as PalletRackNodeShape | null)
      if (!rack) {
        setBayFilter(null)
        return
      }

      const rackAisle = (rack.rowLabel || rack.frontAisleLabel || '').trim()
      const rackBay = String(rack.bayIndex).padStart(2, '0')

      if (rackAisle) setAisleFilter(rackAisle)
      if (rackBay) setBayFilter(rackBay)

      // Highlight first matching location
      const matching = locations.find((l) => {
        if (l.nodeId && l.nodeId === rack.id) return true
        return (
          l.aisle.trim().toUpperCase() === rackAisle.toUpperCase() &&
          String(l.bay).padStart(2, '0') === rackBay
        )
      })

      if (matching) {
        setSelectedLocation(matching)
      }
      setScrollTop(0)
    },
    [locations],
  )

  // Row selection handler (Grid -> 2D Canvas)
  const handleSelectRow = (loc: WarehouseLocation) => {
    setSelectedLocation(loc)

    // Lookup matching rack in canvas scene
    const matching = Object.values(effectiveSceneNodes).find((node) => {
      if (node.type !== 'warehouse:pallet-rack') return false
      if (loc.nodeId && node.id === loc.nodeId) return true
      const aisleMatch =
        (node.rowLabel || node.frontAisleLabel || '').trim().toUpperCase() ===
        loc.aisle.trim().toUpperCase()
      const bayMatch = String(node.bayIndex).padStart(2, '0') === String(loc.bay).padStart(2, '0')
      return aisleMatch && bayMatch
    })

    if (matching) {
      setSelectedRackNode(matching)
    }
  }

  // Schematic / Bay click handler
  const handleSelectBay = (aisle: string, bay: string) => {
    setAisleFilter(aisle)
    setBayFilter(bay)
    const match = locations.find(
      (l) => l.aisle.toUpperCase() === aisle.toUpperCase() && String(l.bay).padStart(2, '0') === bay,
    )
    if (match) {
      setSelectedLocation(match)
      handleSelectRow(match)
    }
  }

  // Multi-selection toggle
  const handleToggleRackSelection = useCallback((rackId: string) => {
    setSelectedRackIds((prev) =>
      prev.includes(rackId) ? prev.filter((id) => id !== rackId) : [...prev, rackId],
    )
  }, [])

  // Select all racks in a row (triggered from Aisle Sign click in 2D or table)
  const handleSelectWholeRow = useCallback(
    (rowLabel: string) => {
      const cleanTarget = rowLabel.trim().toUpperCase()
      const matching = Object.values(effectiveSceneNodes).filter((node) => {
        if (node.type !== 'warehouse:pallet-rack' && (node as any).rowLabel === undefined) return false
        const row = (node.rowLabel || node.frontAisleLabel || '').trim().toUpperCase()
        return row === cleanTarget
      })
      const ids = matching.map((m) => m.id)
      if (ids.length === 0) return

      setSelectedRackIds((prev) => {
        const allAlready = ids.every((id) => prev.includes(id))
        if (allAlready) {
          return prev.filter((id) => !ids.includes(id))
        } else {
          return Array.from(new Set([...prev, ...ids]))
        }
      })
      setAisleFilter(rowLabel)
    },
    [effectiveSceneNodes],
  )

  // Clear all addresses for the active site
  const handleClearAllAddresses = async () => {
    setClearingAll(true)
    try {
      const res = await call(`/api/locations?siteId=${encodeURIComponent(selectedSiteId)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setLocations([])
        setSelectedLocation(null)
        setEditingId(null)

        const updatedNodes: Record<string, PalletRackNodeShape> = {}
        for (const [id, node] of Object.entries(effectiveSceneNodes)) {
          if (node.type === 'warehouse:pallet-rack' || node.rowLabel !== undefined) {
            updatedNodes[id] = {
              ...node,
              rowLabel: '',
              frontAisleLabel: '',
              rearAisleLabel: '',
            }
          } else {
            updatedNodes[id] = node
          }
        }
        setSceneNodes(updatedNodes)
        if (selectedRackNode) {
          setSelectedRackNode({
            ...selectedRackNode,
            rowLabel: '',
            frontAisleLabel: '',
            rearAisleLabel: '',
          })
        }
        setSelectedRackIds([])

        const currentSite = sites.find((s) => s.id === selectedSiteId)
        if (currentSite?.sceneId) {
          await call(`/api/scenes/${currentSite.sceneId}`, {
            method: 'PATCH',
            body: { patch: updatedNodes },
          }).catch(() => {})
        }

        if (typeof window !== 'undefined') {
          const payload = {
            type: 'BATCH_RACK_UPDATE',
            racks: Object.values(updatedNodes).map((r) => ({
              id: r.id,
              rowLabel: '',
              frontAisleLabel: '',
              rearAisleLabel: '',
            })),
          }
          try {
            const bc = new BroadcastChannel('dt_warehouse_sync')
            bc.postMessage(payload)
            bc.close()
          } catch (_e) {}
          window.dispatchEvent(new CustomEvent('dt_warehouse_sync', { detail: payload }))
        }

        notify('Tüm adresler başarıyla silindi ve raflar adressiz hale getirildi', 'success')
        setShowClearAllModal(false)
      } else {
        notify('Adresler silinirken hata oluştu', 'error')
      }
    } catch (_err) {
      notify('Adresler silinirken hata oluştu', 'error')
    } finally {
      setClearingAll(false)
    }
  }

  // Clear addresses for selected racks only
  const handleClearSelectedRacksAddresses = async () => {
    if (selectedRackIds.length === 0) return
    const idsSet = new Set(selectedRackIds)
    const affectedLocs = locations.filter((l) => l.nodeId && idsSet.has(l.nodeId))

    for (const loc of affectedLocs) {
      await call(`/api/locations/${loc.id}`, { method: 'DELETE' }).catch(() => {})
    }
    setLocations((prev) => prev.filter((l) => !l.nodeId || !idsSet.has(l.nodeId)))

    const patchNodes: Record<string, PalletRackNodeShape> = {}
    setSceneNodes((prev) => {
      const next = { ...prev }
      for (const id of selectedRackIds) {
        if (next[id]) {
          next[id] = { ...next[id], rowLabel: '', frontAisleLabel: '', rearAisleLabel: '' }
          patchNodes[id] = next[id]
        }
      }
      return next
    })

    const currentSite = sites.find((s) => s.id === selectedSiteId)
    if (currentSite?.sceneId && Object.keys(patchNodes).length > 0) {
      await call(`/api/scenes/${currentSite.sceneId}`, {
        method: 'PATCH',
        body: { patch: patchNodes },
      }).catch(() => {})
    }

    if (typeof window !== 'undefined') {
      const payload = {
        type: 'BATCH_RACK_UPDATE',
        racks: Object.values(patchNodes).map((r) => ({
          id: r.id,
          rowLabel: '',
          frontAisleLabel: '',
          rearAisleLabel: '',
        })),
      }
      try {
        const bc = new BroadcastChannel('dt_warehouse_sync')
        bc.postMessage(payload)
        bc.close()
      } catch (_e) {}
      window.dispatchEvent(new CustomEvent('dt_warehouse_sync', { detail: payload }))
    }

    const count = selectedRackIds.length
    setSelectedRackIds([])
    notify(`${count} adet rafın adresleri başarıyla temizlendi`, 'success')
  }

  // Apply row naming ("01L", "01R", etc.) and auto-number sequential bay indices
  const handleApplyRowNaming = async (params: {
    newAisleName: string
    startBay: number
    levels: number
    palletsPerLevel: number
  }) => {
    if (selectedRackIds.length === 0) return
    const targetRacks = selectedRackIds
      .map((id) => effectiveSceneNodes[id])
      .filter((n): n is PalletRackNodeShape => Boolean(n))

    if (targetRacks.length === 0) return

    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity
    for (const r of targetRacks) {
      const px = r.position?.[0] ?? 0
      const pz = r.position?.[2] ?? 0
      minX = Math.min(minX, px)
      maxX = Math.max(maxX, px)
      minZ = Math.min(minZ, pz)
      maxZ = Math.max(maxZ, pz)
    }

    const deltaX = maxX - minX
    const deltaZ = maxZ - minZ

    targetRacks.sort((a, b) => {
      const ax = a.position?.[0] ?? 0
      const az = a.position?.[2] ?? 0
      const bx = b.position?.[0] ?? 0
      const bz = b.position?.[2] ?? 0
      return deltaX >= deltaZ ? ax - bx : az - bz
    })

    const cleanAisle = params.newAisleName.trim().toUpperCase() || '01L'
    const updatedSceneNodes: Record<string, PalletRackNodeShape> = {}
    const newLocationsToSave: WarehouseLocation[] = []
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

    targetRacks.forEach((rack, idx) => {
      const bayNumber = params.startBay + idx
      const bayStr = String(bayNumber).padStart(2, '0')
      const updatedRack: PalletRackNodeShape = {
        ...rack,
        rowLabel: cleanAisle,
        bayIndex: bayNumber,
        frontAisleLabel: cleanAisle,
        levels: params.levels,
        palletsPerLevel: params.palletsPerLevel,
      }
      updatedSceneNodes[rack.id] = updatedRack

      for (let l = 0; l < params.levels; l++) {
        const lvlChar = alphabet[l] ?? `L${l + 1}`
        for (let p = 1; p <= params.palletsPerLevel; p++) {
          const addressId = formatIndustrialAddress({
            aisle: cleanAisle,
            bay: bayStr,
            level: lvlChar,
            position: String(p),
          })
          const barcode = generateBarcode(addressId)
          const locId = `loc_${selectedSiteId}_${cleanAisle}_${bayStr}_${lvlChar}_${p}`

          newLocationsToSave.push({
            id: locId,
            siteId: selectedSiteId,
            siteName: selectedSite?.name || 'BURSA BAŞKÖY EXT',
            aisle: cleanAisle,
            bay: bayStr,
            level: lvlChar,
            position: String(p),
            addressId,
            barcode,
            status: 'Active',
            maxWeight: 1000,
            nodeId: rack.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
        }
      }
    })

    setSceneNodes((prev) => ({
      ...prev,
      ...updatedSceneNodes,
    }))

    try {
      await call('/api/locations/bulk', {
        method: 'POST',
        body: {
          siteId: selectedSiteId,
          locations: newLocationsToSave,
          mode: 'upsert',
        },
      })
      await loadLocations()
    } catch (_err) {
      notify('Adresler kaydedilirken hata oluştu', 'error')
    }

    const currentSite = sites.find((s) => s.id === selectedSiteId)
    if (currentSite?.sceneId) {
      await call(`/api/scenes/${currentSite.sceneId}`, {
        method: 'PATCH',
        body: { patch: updatedSceneNodes },
      }).catch(() => {})
    }

    if (typeof window !== 'undefined') {
      const payload = {
        type: 'BATCH_RACK_UPDATE',
        racks: Object.values(updatedSceneNodes).map((r) => ({
          id: r.id,
          rowLabel: cleanAisle,
          bayIndex: r.bayIndex,
          frontAisleLabel: cleanAisle,
          levels: r.levels,
          palletsPerLevel: r.palletsPerLevel,
        })),
      }
      try {
        const bc = new BroadcastChannel('dt_warehouse_sync')
        bc.postMessage(payload)
        bc.close()
      } catch (_e) {}
      window.dispatchEvent(new CustomEvent('dt_warehouse_sync', { detail: payload }))
    }

    setRowNamingModal((prev) => ({ ...prev, isOpen: false }))
    setSelectedRackIds([])
    setAisleFilter(cleanAisle)
    notify(
      `${targetRacks.length} adet rafa "${cleanAisle}" koridoru ve sıralı bay numaraları atandı, ${newLocationsToSave.length} adres oluşturuldu!`,
      'success',
    )
  }

  // Matching locations for currently selected rack
  const matchingLocationsForSelectedRack = useMemo(() => {
    if (!selectedRackNode) return []
    const rackAisle = (selectedRackNode.rowLabel || selectedRackNode.frontAisleLabel || '').trim().toUpperCase()
    const rackBay = String(selectedRackNode.bayIndex).padStart(2, '0')
    return locations.filter((l) => {
      if (l.nodeId && l.nodeId === selectedRackNode.id) return true
      return l.aisle.trim().toUpperCase() === rackAisle && String(l.bay).padStart(2, '0') === rackBay
    })
  }, [locations, selectedRackNode])

  // Save Handler: Rack Properties & Location Address Cascading
  const handleUpdateRack = async (
    changes: Partial<PalletRackNodeShape>,
    customLocationUpdates?: Partial<WarehouseLocation>[],
  ) => {
    if (!selectedRackNode) return
    const rackId = selectedRackNode.id
    const oldAisle = (selectedRackNode.rowLabel || selectedRackNode.frontAisleLabel || '').trim()
    const oldBay = String(selectedRackNode.bayIndex).padStart(2, '0')

    const newAisle = (changes.rowLabel ?? oldAisle).trim()
    const newBay = changes.bayIndex !== undefined ? String(changes.bayIndex).padStart(2, '0') : oldBay
    const newLevels = changes.levels !== undefined ? changes.levels : (selectedRackNode.levels ?? 6)

    // 1. Optimistically update local scene graph
    const updatedRack: PalletRackNodeShape = {
      ...selectedRackNode,
      ...changes,
      rowLabel: newAisle,
      bayIndex: parseInt(newBay, 10) || 1,
      levels: newLevels,
      palletsPerLevel: changes.palletsPerLevel !== undefined ? changes.palletsPerLevel : selectedRackNode.palletsPerLevel,
      bayClearWidth: changes.bayClearWidth !== undefined ? changes.bayClearWidth : selectedRackNode.bayClearWidth,
    }

    setSceneNodes((prev) => ({
      ...prev,
      [rackId]: updatedRack,
    }))
    setSelectedRackNode(updatedRack)

    // 2. Identify affected locations
    const affectedLocations = locations.filter((l) => {
      if (l.nodeId && l.nodeId === rackId) return true
      return (
        l.aisle.trim().toUpperCase() === oldAisle.toUpperCase() &&
        String(l.bay).padStart(2, '0') === oldBay
      )
    })

    const updatedMap = new Map<string, WarehouseLocation>()
    const patchItems: Partial<WarehouseLocation>[] = []

    if (customLocationUpdates && customLocationUpdates.length > 0) {
      for (const custom of customLocationUpdates) {
        const existing = affectedLocations.find(
          (l) =>
            (custom.id && l.id === custom.id) ||
            ((l.level.toUpperCase() === custom.level?.toUpperCase() || l.level === custom.level) &&
              String(l.position) === String(custom.position)),
        )

        const finalAddress =
          custom.addressId ||
          formatIndustrialAddress({
            aisle: newAisle,
            bay: newBay,
            level: custom.level || 'A',
            position: custom.position || '1',
          })
        const finalBarcode = custom.barcode || generateBarcode(finalAddress)

        if (existing) {
          const updatedLoc: WarehouseLocation = {
            ...existing,
            ...custom,
            aisle: newAisle,
            bay: newBay,
            addressId: finalAddress,
            barcode: finalBarcode,
            nodeId: rackId,
            updatedAt: new Date().toISOString(),
          }
          updatedMap.set(existing.id, updatedLoc)
          patchItems.push({
            id: existing.id,
            aisle: newAisle,
            bay: newBay,
            level: custom.level || existing.level,
            position: custom.position || existing.position,
            addressId: finalAddress,
            barcode: finalBarcode,
            status: custom.status || existing.status,
            maxWeight: custom.maxWeight !== undefined ? custom.maxWeight : existing.maxWeight,
            nodeId: rackId,
          })
        } else {
          // Newly added level/position
          const newLocId =
            custom.id || `loc_${selectedSiteId}_${newAisle}_${newBay}_${custom.level}_${custom.position}`
          const newLoc: WarehouseLocation = {
            id: newLocId,
            siteId: selectedSiteId,
            siteName: selectedSite?.name || 'BURSA BAŞKÖY EXT',
            aisle: newAisle,
            bay: newBay,
            level: custom.level || 'A',
            position: custom.position || '1',
            addressId: finalAddress,
            barcode: finalBarcode,
            status: custom.status || 'Active',
            maxWeight: custom.maxWeight ?? 1000,
            nodeId: rackId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          updatedMap.set(newLocId, newLoc)
          patchItems.push(newLoc)
        }
      }

      // Clean up any obsolete locations that were trimmed (e.g. from 3 down to 2 or 1 pallets)
      const activePositionsSet = new Set(
        customLocationUpdates.map((c) => `${(c.level || 'A').toUpperCase()}_${c.position}`),
      )
      const obsoleteLocations = affectedLocations.filter(
        (l) => !activePositionsSet.has(`${l.level.toUpperCase()}_${l.position}`),
      )
      if (obsoleteLocations.length > 0) {
        const obsoleteIds = new Set(obsoleteLocations.map((l) => l.id))
        setLocations((prev) => prev.filter((l) => !obsoleteIds.has(l.id)))
        for (const obs of obsoleteLocations) {
          void call(`/api/locations/${obs.id}`, { method: 'DELETE' }).catch(() => {})
        }
      }
    } else if (affectedLocations.length > 0) {
      for (const loc of affectedLocations) {
        const newAddressId = formatIndustrialAddress({
          aisle: newAisle,
          bay: newBay,
          level: loc.level,
          position: loc.position,
        })
        const newBarcode = generateBarcode(newAddressId)
        const updatedLoc: WarehouseLocation = {
          ...loc,
          aisle: newAisle,
          bay: newBay,
          addressId: newAddressId,
          barcode: newBarcode,
          updatedAt: new Date().toISOString(),
        }
        updatedMap.set(loc.id, updatedLoc)
        patchItems.push({
          id: loc.id,
          aisle: newAisle,
          bay: newBay,
          addressId: newAddressId,
          barcode: newBarcode,
        })
      }
    }

    if (patchItems.length > 0) {
      setLocations((prev) => {
        const existingIds = new Set(prev.map((l) => l.id))
        const mapped = prev.map((l) => updatedMap.get(l.id) ?? l)
        const added = Array.from(updatedMap.values()).filter((l) => !existingIds.has(l.id))
        return [...mapped, ...added]
      })
      if (selectedLocation && updatedMap.has(selectedLocation.id)) {
        setSelectedLocation(updatedMap.get(selectedLocation.id)!)
      }

      // Persist to /api/locations/bulk (or fallback to PATCH /api/locations/:id)
      try {
        const bulkRes = await call('/api/locations/bulk', {
          method: 'POST',
          body: {
            siteId: selectedSiteId,
            locations: patchItems,
            mode: 'upsert',
          },
        })
        if (!bulkRes.ok) {
          for (const item of patchItems) {
            await call(`/api/locations/${item.id}`, {
              method: 'PATCH',
              body: item,
            })
          }
        }
        notify('Raf ve adres tanımları başarıyla kaydedildi', 'success')
      } catch (_err) {
        notify('Adres kayıtları güncellenirken hata oluştu', 'error')
      }
    } else {
      notify('Raf özellikleri güncellendi', 'success')
    }

    // 3. Persist to scene API if site has sceneId
    const currentSite = sites.find((s) => s.id === selectedSiteId)
    if (currentSite?.sceneId) {
      try {
        await call(`/api/scenes/${currentSite.sceneId}`, {
          method: 'PATCH',
          body: {
            patch: {
              [rackId]: updatedRack,
            },
          },
        })
      } catch (_err) {
        // Non-fatal
      }
    }

    // 4. Live BroadcastChannel & CustomEvent Sync with 3D Viewer & plugin-warehouse
    if (typeof window !== 'undefined') {
      const payload = {
        type: 'RACK_LABEL_UPDATED',
        rackId,
        rowLabel: newAisle,
        bayIndex: parseInt(newBay, 10) || 1,
        levels: newLevels,
        palletsPerLevel: updatedRack.palletsPerLevel,
        bayClearWidth: updatedRack.bayClearWidth,
        frontAisleLabel: changes.frontAisleLabel ?? newAisle,
        rearAisleLabel: changes.rearAisleLabel ?? '',
        zoneCode: changes.zoneCode,
        patch: {
          rowLabel: newAisle,
          bayIndex: parseInt(newBay, 10) || 1,
          levels: newLevels,
          palletsPerLevel: updatedRack.palletsPerLevel,
          bayClearWidth: updatedRack.bayClearWidth,
          frontAisleLabel: changes.frontAisleLabel ?? newAisle,
          rearAisleLabel: changes.rearAisleLabel ?? '',
          zoneCode: changes.zoneCode,
        },
      }
      try {
        const bc = new BroadcastChannel('dt_warehouse_sync')
        bc.postMessage(payload)
        bc.close()
      } catch (_e) {}

      try {
        window.dispatchEvent(new CustomEvent('dt_warehouse_sync', { detail: payload }))
      } catch (_e) {}
    }
  }

  // Start inline edit
  const startEdit = (loc: WarehouseLocation) => {
    if (!canEdit) return
    setEditingId(loc.id)
    setEditDraft({
      addressId: loc.addressId,
      barcode: loc.barcode,
      maxWeight: loc.maxWeight,
      status: loc.status,
    })
  }

  // Cancel inline edit
  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft(null)
  }

  // Commit inline edit with optimistic update and rollback
  const saveEdit = async (locId: string) => {
    if (!editDraft) return
    const original = locations.find((l) => l.id === locId)
    if (!original) return

    // Optimistic update
    const updatedLoc: WarehouseLocation = {
      ...original,
      addressId: editDraft.addressId.trim() || original.addressId,
      barcode: editDraft.barcode.trim() || original.barcode,
      maxWeight: Number(editDraft.maxWeight) || original.maxWeight,
      status: editDraft.status,
      updatedAt: new Date().toISOString(),
    }

    setLocations((prev) => prev.map((l) => (l.id === locId ? updatedLoc : l)))
    if (selectedLocation?.id === locId) {
      setSelectedLocation(updatedLoc)
    }

    setEditingId(null)
    setEditDraft(null)
    setSavingId(locId)
    notify(t.addrSaved ?? 'Location updated', 'success')

    try {
      const res = await call<{ location: WarehouseLocation }>(`/api/locations/${locId}`, {
        method: 'PATCH',
        body: editDraft,
      })

      if (!res.ok) {
        // Rollback
        setLocations((prev) => prev.map((l) => (l.id === locId ? original : l)))
        if (selectedLocation?.id === locId) setSelectedLocation(original)
        notify('Failed to save location', 'error')
      }
    } catch (_err) {
      setLocations((prev) => prev.map((l) => (l.id === locId ? original : l)))
      if (selectedLocation?.id === locId) setSelectedLocation(original)
      notify('Failed to save location', 'error')
    } finally {
      setSavingId(null)
    }
  }

  // CSV Export handler
  const handleExportCsv = () => {
    if (locations.length === 0) {
      notify('No locations to export', 'error')
      return
    }
    const currentSite = sites.find((s) => s.id === selectedSiteId)
    const siteSlug = (currentSite?.name || 'warehouse').replace(/\s+/g, '_').toLowerCase()
    exportLocationsToCsv(filteredLocations.length > 0 ? filteredLocations : locations, `${siteSlug}-locations.csv`)
    notify('CSV exported successfully', 'success')
  }

  // CSV Import handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const text = evt.target?.result as string
        if (!text) return

        const { rows, errors } = parseRfc4180Csv(text)
        if (errors.length > 0 && rows.length === 0) {
          notify(errors[0] ?? 'CSV parsing error', 'error')
          return
        }

        const res = await call<{
          applied: number
          created: number
          updated: number
          total: number
        }>('/api/locations/bulk', {
          method: 'POST',
          body: {
            siteId: selectedSiteId,
            locations: rows,
          },
        })

        if (res.ok) {
          await loadLocations()
          const created = res.data.created || 0
          const updated = res.data.updated || 0
          const count = created + updated
          const tmpl = t.addrImportSuccess ?? '{count} locations imported ({created} created, {updated} updated)'
          const msg = tmpl
            .replace('{count}', String(count))
            .replace('{created}', String(created))
            .replace('{updated}', String(updated))
          notify(msg, 'success')
        } else {
          notify(t.addrImportFailed ?? 'Failed to import locations', 'error')
        }
      } catch (_err) {
        notify('Failed to import CSV file', 'error')
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  // Calculate status counts
  const statusCounts = useMemo(() => {
    let active = 0,
      blocked = 0,
      quarantine = 0
    for (const loc of locations) {
      if (loc.status === 'Active') active++
      else if (loc.status === 'Blocked') blocked++
      else if (loc.status === 'Quarantine') quarantine++
    }
    return { total: locations.length, active, blocked, quarantine }
  }, [locations])

  return (
    <section className="flex flex-col gap-3.5 w-full select-none" style={{ animation: 'dtFade 0.2s ease' }}>
      {/* Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-semibold text-fg tracking-tight">
            {t.addrTitle ?? 'Warehouse Addresses'}
          </h2>
          <p className="m-0 text-xs text-muted-fg font-mono mt-0.5">
            {t.addrTotal ?? 'Total'}: {statusCounts.total} · {t.addrActive ?? 'Active'}: {statusCounts.active} ·{' '}
            {t.addrBlocked ?? 'Blocked'}: {statusCounts.blocked} · {t.addrQuarantine ?? 'Quarantine'}:{' '}
            {statusCounts.quarantine}
          </p>
        </div>

        {/* Top Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Site Selector Dropdown */}
          <select
            value={selectedSiteId}
            onChange={(e) => {
              setSelectedSiteId(e.target.value)
              setBayFilter(null)
              setSelectedLocation(null)
            }}
            className="h-8 rounded-lg border border-input bg-field px-2.5 text-xs font-semibold text-fg outline-none cursor-pointer focus:border-ring"
          >
            {sites.map((s) => (
              <option key={s.id} value={s.id} className="bg-surface text-fg">
                {s.name}
              </option>
            ))}
          </select>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={locations.length === 0}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-fg hover:bg-hover transition-colors disabled:opacity-50"
            title="Export CSV (UTF-8 BOM Excel Compatible)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>{t.addrExportCsv ?? 'Export CSV'}</span>
          </button>

          {/* Import CSV */}
          {canEdit && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-xs font-medium text-fg hover:bg-hover transition-colors"
                title="Bulk Import CSV"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>{t.addrImportCsv ?? 'Import CSV'}</span>
              </button>

              {/* Clear All Addresses */}
              <button
                type="button"
                onClick={() => setShowClearAllModal(true)}
                disabled={locations.length === 0}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                title="Mevcut projedeki tüm lokasyon adreslerini temizle"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                <span>Tüm Adresleri Temizle</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-xl border border-border bg-surface text-xs">
        {/* Search Query Input */}
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.addrSearchPlaceholder ?? 'Search aisle, bay, address ID, barcode…'}
            className="w-full h-7 rounded-lg border border-input bg-field px-2.5 text-xs text-fg outline-none focus:border-ring"
          />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1 bg-field p-0.5 rounded-lg border border-input">
          {(['All', 'Active', 'Blocked', 'Quarantine'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={cn(
                'px-2 py-1 rounded-md text-[11px] font-medium transition-colors',
                statusFilter === st ? 'bg-primary text-primary-fg font-semibold shadow-xs' : 'text-muted-fg hover:text-fg',
              )}
            >
              {st === 'All' ? t.addrAllStatuses ?? 'All' : st}
            </button>
          ))}
        </div>

        {/* Aisle Filter Dropdown */}
        <div className="flex items-center gap-1">
          <select
            value={aisleFilter}
            onChange={(e) => setAisleFilter(e.target.value)}
            className="h-7 rounded-lg border border-input bg-field px-2 text-xs font-medium text-fg outline-none cursor-pointer focus:border-ring"
          >
            <option value="All">{t.addrAllAisles ?? 'All aisles'}</option>
            {distinctAisles.map((a) => (
              <option key={a} value={a}>
                Sıra {a}
              </option>
            ))}
          </select>
        </div>

        {/* Active Bay Filter Chip (if clicked from schematic) */}
        {bayFilter && (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-red-950/40 border border-red-700/50 text-[11px] font-mono text-red-300">
            <span>
              {aisleFilter !== 'All' ? `Sıra ${aisleFilter} - ` : ''}Göz {bayFilter}
            </span>
            <button
              type="button"
              onClick={() => {
                setBayFilter(null)
                setAisleFilter('All')
              }}
              className="ml-1 hover:text-red-100 font-bold"
              title="Filtreyi Temizle"
            >
              ✕
            </button>
          </div>
        )}

        {/* Clear Filters Button */}
        {(search || statusFilter !== 'All' || aisleFilter !== 'All' || bayFilter) && (
          <button
            type="button"
            onClick={() => {
              setSearch('')
              setStatusFilter('All')
              setAisleFilter('All')
              setBayFilter(null)
            }}
            className="px-2 py-1 text-xs text-muted-fg hover:text-fg"
          >
            Sıfırla
          </button>
        )}
      </div>

      {/* Main Two-Column Workspace (60% Grid, 40% Schematic) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 items-start">
        {/* Left Column: Virtual Data Grid (approx 60%) */}
        <div className="xl:col-span-7 flex flex-col rounded-xl border border-border bg-surface overflow-hidden shadow-xs">
          {/* Table Header */}
          <div
            className="grid items-center border-b border-border bg-field/80 text-[11px] font-semibold text-muted-fg font-mono uppercase tracking-wider px-3"
            style={{
              gridTemplateColumns:
                'minmax(45px, 0.6fr) minmax(45px, 0.6fr) minmax(45px, 0.5fr) minmax(40px, 0.5fr) minmax(105px, 1.2fr) minmax(110px, 1.2fr) minmax(85px, 0.9fr) 85px 75px',
              height: 38,
            }}
          >
            <div className="text-center">{t.addrColAisle ?? 'Aisle'}</div>
            <div className="text-center">{t.addrColBay ?? 'Bay'}</div>
            <div className="text-center">{t.addrColLevel ?? 'Level'}</div>
            <div className="text-center">{t.addrColPosition ?? 'Pos'}</div>
            <div>{t.addrColAddressId ?? 'Address ID'}</div>
            <div>{t.addrColBarcode ?? 'Barcode'}</div>
            <div className="text-right">{t.addrColMaxWeight ?? 'Max (kg)'}</div>
            <div className="text-center">{t.addrColStatus ?? 'Status'}</div>
            <div className="text-center">{t.addrColActions ?? 'Actions'}</div>
          </div>

          {/* Virtualized Rows Container */}
          <div
            ref={gridContainerRef}
            onScroll={handleScroll}
            className="relative overflow-y-auto overflow-x-hidden font-mono text-xs"
            style={{ height: 520 }}
          >
            {loading ? (
              <div className="flex h-40 items-center justify-center text-xs text-muted-fg">
                <span>Lokasyonlar yükleniyor...</span>
              </div>
            ) : totalCount === 0 ? (
              <div className="flex flex-col h-56 items-center justify-center text-xs text-muted-fg gap-2 px-6 text-center">
                <span className="font-semibold text-fg text-sm">
                  {selectedRackNode
                    ? `Sıra ${selectedRackNode.rowLabel || selectedRackNode.frontAisleLabel || 'A'} - Göz ${String(selectedRackNode.bayIndex ?? 1).padStart(2, '0')} için henüz adres kaydı yok`
                    : (t.addrNoLocations ?? 'Bu filtrelere uygun lokasyon bulunamadı.')}
                </span>
                {selectedRackNode ? (
                  <p className="text-[11px] text-muted-fg max-w-md">
                    Sağdaki panelden bu rafın kat sayısını ({selectedRackNode.levels ?? 6}) ve göz palet kapasitesini (1, 2 veya 3 palet) belirleyip <strong>Rafı ve Adresleri Güncelle</strong> butonuna basarak adresleri anında oluşturabilirsiniz.
                  </p>
                ) : (
                  (search || statusFilter !== 'All' || aisleFilter !== 'All' || bayFilter) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearch('')
                        setStatusFilter('All')
                        setAisleFilter('All')
                        setBayFilter(null)
                      }}
                      className="mt-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
                    >
                      Filtreleri Temizle
                    </button>
                  )
                )}
              </div>
            ) : (
              <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    transform: `translateY(${offsetY}px)`,
                    willChange: 'transform',
                  }}
                >
                  {visibleRows.map((loc) => {
                    const isSelected = selectedLocation?.id === loc.id
                    const isEditing = editingId === loc.id
                    const lvlColor = getLevelColor(loc.level)

                    return (
                      <div
                        key={loc.id}
                        onClick={() => handleSelectRow(loc)}
                        onDoubleClick={() => startEdit(loc)}
                        className={cn(
                          'grid items-center px-3 border-b border-border/40 transition-colors cursor-pointer',
                          isSelected ? 'bg-red-500/15 hover:bg-red-500/20' : 'hover:bg-hover/60',
                          isEditing && 'bg-primary/5',
                        )}
                        style={{
                          height: ROW_HEIGHT,
                          gridTemplateColumns:
                            'minmax(45px, 0.6fr) minmax(45px, 0.6fr) minmax(45px, 0.5fr) minmax(40px, 0.5fr) minmax(105px, 1.2fr) minmax(110px, 1.2fr) minmax(85px, 0.9fr) 85px 75px',
                        }}
                      >
                        {/* Aisle */}
                        <div className="text-center font-bold text-fg">{loc.aisle}</div>

                        {/* Bay */}
                        <div className="text-center text-muted-fg">{String(loc.bay).padStart(2, '0')}</div>

                        {/* Level */}
                        <div className="text-center">
                          <span
                            className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold text-white shadow-xs"
                            style={{ backgroundColor: lvlColor }}
                          >
                            {loc.level}
                          </span>
                        </div>

                        {/* Position */}
                        <div className="text-center text-muted-fg">{loc.position}</div>

                        {/* Address ID */}
                        <div className="font-semibold truncate">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft?.addressId ?? ''}
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, addressId: e.target.value } : null))
                              }
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveEdit(loc.id)
                              }}
                              className="w-full h-6 px-1 rounded bg-field border border-primary text-xs outline-none text-fg"
                              ref={(el) => el?.focus()}
                            />
                          ) : (
                            <span className={isSelected ? 'text-red-400 font-bold' : 'text-fg'}>
                              {loc.addressId}
                            </span>
                          )}
                        </div>

                        {/* Barcode */}
                        <div className="text-muted-fg truncate text-[11px]">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editDraft?.barcode ?? ''}
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, barcode: e.target.value } : null))
                              }
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveEdit(loc.id)
                              }}
                              className="w-full h-6 px-1 rounded bg-field border border-primary text-xs outline-none text-fg"
                            />
                          ) : (
                            <span>{loc.barcode}</span>
                          )}
                        </div>

                        {/* Max Weight */}
                        <div className="text-right truncate">
                          {isEditing ? (
                            <input
                              type="number"
                              value={editDraft?.maxWeight ?? 1000}
                              onChange={(e) =>
                                setEditDraft((d) => (d ? { ...d, maxWeight: Number(e.target.value) } : null))
                              }
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveEdit(loc.id)
                              }}
                              className="w-full h-6 px-1 rounded bg-field border border-primary text-xs outline-none text-fg text-right"
                            />
                          ) : (
                            <span className="text-muted-fg">{loc.maxWeight}</span>
                          )}
                        </div>

                        {/* Status */}
                        <div className="text-center" onClick={(e) => e.stopPropagation()}>
                          {isEditing ? (
                            <select
                              value={editDraft?.status ?? 'Active'}
                              onChange={(e) =>
                                setEditDraft((d) =>
                                  d ? { ...d, status: e.target.value as LocationStatus } : null,
                                )
                              }
                              className="h-6 rounded border border-primary bg-field px-1 text-[10px] text-fg outline-none"
                            >
                              <option value="Active">Active</option>
                              <option value="Blocked">Blocked</option>
                              <option value="Quarantine">Quarantine</option>
                            </select>
                          ) : (
                            <span
                              className={cn(
                                'inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold',
                                loc.status === 'Active' &&
                                  'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
                                loc.status === 'Blocked' &&
                                  'bg-rose-500/15 text-rose-500 border border-rose-500/30',
                                loc.status === 'Quarantine' &&
                                  'bg-amber-500/15 text-amber-500 border border-amber-500/30',
                              )}
                            >
                              {loc.status}
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="text-center" onClick={(e) => e.stopPropagation()}>
                          {isEditing ? (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => void saveEdit(loc.id)}
                                disabled={savingId === loc.id}
                                className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-500"
                                title="Kaydet"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 text-[10px] hover:bg-slate-600"
                                title="İptal (Esc)"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            canEdit && (
                              <button
                                type="button"
                                onClick={() => startEdit(loc)}
                                className="p-1 rounded text-muted-fg hover:text-fg hover:bg-hover transition-colors"
                                title="Düzenle"
                              >
                                <svg
                                  width="13"
                                  height="13"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                            )
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Grid Footer Bar */}
          <div className="flex items-center justify-between px-3 py-2 bg-field/60 border-t border-border text-[11px] font-mono text-muted-fg">
            <span>
              Gösterilen: {filteredLocations.length} / {locations.length}
            </span>
            {selectedLocation && (
              <span className="text-red-400 font-semibold">
                Seçili: {selectedLocation.addressId} ({selectedLocation.aisle}-{selectedLocation.bay})
              </span>
            )}
          </div>
        </div>

        {/* Right Column: Interactive 2D Canvas + Batch Actions (approx 40%) */}
        <div className="xl:col-span-5 sticky top-4 flex flex-col gap-3">
          {/* Multi-selection Toolbar if racks are selected */}
          {selectedRackIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-black font-bold text-[11px]">
                  {selectedRackIds.length}
                </span>
                <span className="font-semibold text-amber-200">raf seçildi</span>
                <span className="text-[11px] text-amber-400/80">(Shift + Tıkla)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRowNamingModal({ isOpen: true, newAisleName: '01L', startBay: 1, levels: 6, palletsPerLevel: 3 })}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-black font-semibold text-[11px] hover:bg-amber-400 transition-colors shadow-xs"
                >
                  Sırayı İsimlendir & Adresle
                </button>
                <button
                  type="button"
                  onClick={handleClearSelectedRacksAddresses}
                  className="px-2.5 py-1 rounded-lg bg-red-950/60 border border-red-700/60 text-red-300 font-medium text-[11px] hover:bg-red-900/60 transition-colors"
                >
                  Adresleri Sil
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRackIds([])}
                  className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white text-[11px] transition-colors"
                >
                  Vazgeç
                </button>
              </div>
            </div>
          )}

          <Interactive2DCanvas
            scene={previewScene as any}
            selectedRackId={selectedRackNode?.id ?? null}
            selectedRackIds={selectedRackIds}
            selectedRowLabel={aisleFilter !== 'All' ? aisleFilter : null}
            onSelectRack={handleSelectRackFromCanvas as any}
            onToggleRackSelection={handleToggleRackSelection}
            onSelectWholeRow={handleSelectWholeRow}
            onSelectRow={(row) => {
              if (row) {
                setAisleFilter(row)
                const firstMatch = locations.find((l) => l.aisle.toUpperCase() === row.toUpperCase())
                if (firstMatch) {
                  setSelectedLocation(firstMatch)
                  handleSelectRow(firstMatch)
                }
              }
            }}
            locations={locations}
            siteName={selectedSite?.name || 'BURSA BAŞKÖY EXT'}
            height={620}
            className="w-full"
          />
        </div>
      </div>

      {/* Slide-over Drawer for Selected Rack Property Editor */}
      {selectedRackNode && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface/95 shadow-2xl backdrop-blur-md transition-all duration-300">
          <div className="flex items-center justify-between border-b border-border p-3.5 bg-field/60">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              <h3 className="text-sm font-semibold text-fg">
                Raf Özellikleri & Adresleme
              </h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedRackNode(null)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-fg hover:bg-hover hover:text-fg transition-colors"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <RackPropertyEditorCard
              rack={selectedRackNode}
              onUpdateRack={handleUpdateRack}
              onClose={() => setSelectedRackNode(null)}
              locations={matchingLocationsForSelectedRack}
              canEdit={canEdit}
            />
          </div>
        </div>
      )}

      {/* Clear All Addresses Confirmation Modal */}
      {showClearAllModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-surface p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20 border border-red-500/40">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-semibold text-fg">Tüm Adresleri Temizle?</h3>
                <p className="text-xs text-muted-fg">Bu işlem geri alınamaz.</p>
              </div>
            </div>

            <p className="text-xs text-muted-fg leading-relaxed mb-6">
              Bu depodaki ({locations.length} adet) tüm slot lokasyon adresleri silinecek ve sahnedeki tüm rafların sıra/koridor etiketleri sıfırlanacaktır. Raflar adresi olmayan boş duruma getirilecektir.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowClearAllModal(false)}
                disabled={clearingAll}
                className="px-3.5 py-1.5 rounded-lg border border-border bg-field text-xs font-medium text-fg hover:bg-hover transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={handleClearAllAddresses}
                disabled={clearingAll}
                className="px-4 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500 transition-colors disabled:opacity-50"
              >
                {clearingAll ? 'Temizleniyor...' : 'Evet, Tümünü Temizle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row Naming & Sequential Addressing Modal */}
      {rowNamingModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-fg mb-1">
              Toplu Sıra İsimlendirme & Adresleme
            </h3>
            <p className="text-xs text-muted-fg mb-4">
              Seçili {selectedRackIds.length} adet raf için sıra adı (örn: 01L), ardışık göz numaralandırması ve slot adresleri otomatik üretilir.
            </p>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-muted-fg mb-1">
                  Sıra Adı / Ön Ek (Row Code)
                </label>
                <input
                  type="text"
                  value={rowNamingModal.newAisleName}
                  onChange={(e) => setRowNamingModal((prev) => ({ ...prev, newAisleName: e.target.value.toUpperCase() }))}
                  placeholder="örn. 01L veya 02R"
                  className="w-full h-8 rounded-lg border border-input bg-field px-2.5 font-mono text-xs font-semibold text-fg outline-none focus:border-ring"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-muted-fg mb-1">
                    Başlangıç Göz No
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={rowNamingModal.startBay}
                    onChange={(e) => setRowNamingModal((prev) => ({ ...prev, startBay: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="w-full h-8 rounded-lg border border-input bg-field px-2 text-xs font-mono text-fg outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-fg mb-1">
                    Kat Sayısı
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={rowNamingModal.levels}
                    onChange={(e) => setRowNamingModal((prev) => ({ ...prev, levels: Math.max(1, Math.min(12, parseInt(e.target.value) || 6)) }))}
                    className="w-full h-8 rounded-lg border border-input bg-field px-2 text-xs font-mono text-fg outline-none focus:border-ring"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-fg mb-1">
                    Göz Palet Adedi
                  </label>
                  <select
                    value={rowNamingModal.palletsPerLevel}
                    onChange={(e) => setRowNamingModal((prev) => ({ ...prev, palletsPerLevel: parseInt(e.target.value) || 3 }))}
                    className="w-full h-8 rounded-lg border border-input bg-field px-2 text-xs font-medium text-fg outline-none focus:border-ring cursor-pointer"
                  >
                    <option value={1}>1 Palet</option>
                    <option value={2}>2 Palet</option>
                    <option value={3}>3 Palet</option>
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-border/80 bg-field/60 p-3 text-[11px] font-mono text-muted-fg">
                <span className="text-fg font-semibold">Örnek Üretilecek Adres:</span>{' '}
                <span className="text-emerald-400 font-bold">
                  {rowNamingModal.newAisleName || '01L'}-{String(rowNamingModal.startBay).padStart(2, '0')}-01-1
                </span>
                <p className="mt-1 text-[10px] text-muted-fg">
                  Seçilen {selectedRackIds.length} raf konumsal sıraya göre ardışık (Göz {String(rowNamingModal.startBay).padStart(2, '0')}, {String(rowNamingModal.startBay + 1).padStart(2, '0')}...) olarak güncellenecektir.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRowNamingModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-3.5 py-1.5 rounded-lg border border-border bg-field text-xs font-medium text-fg hover:bg-hover transition-colors"
              >
                Vazgeç
              </button>
              <button
                type="button"
                onClick={() => void handleApplyRowNaming(rowNamingModal)}
                className="px-4 py-1.5 rounded-lg bg-primary text-primary-fg text-xs font-semibold hover:bg-primary/90 transition-colors shadow-xs"
              >
                Sıraya Uygula ve Adresleri Kaydet
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </section>
  )
}
