'use client'

import { useApp } from '@/components/app-providers'
import { Toast } from '@/components/ui/feedback'
import type { SitesResponse } from '@/lib/api-contract'
import { call } from '@/lib/client-api'
import { cn } from '@/lib/cn'
import { useEscapeLayer } from '@/lib/escape-layers'
import type { LocationStatus, WarehouseLocation } from '@/lib/types'
import { WarehousePlanSchematic } from '@/components/console/warehouse-plan-schematic'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'

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
  const csvContent = '\uFEFF' + lines.join('\r\n')
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

export function AddressesTab() {
  const { t } = useApp()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const gridContainerRef = useRef<HTMLDivElement>(null)

  // Sites state
  const [sites, setSites] = useState<Array<{ id: string; name: string }>>([
    { id: '01JM1SITE00000000000000001', name: 'Sakarya LM1' },
  ])
  const [selectedSiteId, setSelectedSiteId] = useState<string>('01JM1SITE00000000000000001')

  // Locations state
  const [locations, setLocations] = useState<WarehouseLocation[]>([])
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(true)

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [aisleFilter, setAisleFilter] = useState<string>('All')
  const [bayFilter, setBayFilter] = useState<string | null>(null)

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

  // Fetch sites
  useEffect(() => {
    let active = true
    async function loadSites() {
      try {
        const res = await call<SitesResponse>('/api/sites')
        if (active && res.ok && res.data.sites && res.data.sites.length > 0) {
          setSites(res.data.sites)
          const firstSite = res.data.sites[0]
          if (firstSite && !res.data.sites.some((s) => s.id === selectedSiteId)) {
            setSelectedSiteId(firstSite.id)
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
  }, [selectedSiteId])

  // Fetch locations
  const loadLocations = useCallback(async () => {
    setLoading(true)
    try {
      const res = await call<{
        locations: WarehouseLocation[]
        total: number
        canEdit?: boolean
      }>(`/api/locations?siteId=${encodeURIComponent(selectedSiteId)}`)

      if (res.ok) {
        setLocations(res.data.locations || [])
        if (res.data.canEdit !== undefined) setCanEdit(res.data.canEdit)
      } else {
        notify('Failed to load locations', 'error')
      }
    } catch (_e) {
      notify('Failed to load locations', 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedSiteId, notify])

  useEffect(() => {
    void loadLocations()
  }, [loadLocations])

  // Distinct aisles for dropdown
  const distinctAisles = useMemo(() => {
    const set = new Set<string>()
    for (const loc of locations) {
      if (loc.aisle) set.add(loc.aisle)
    }
    return Array.from(set).sort()
  }, [locations])

  // Multi-column filtering
  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase()
    return locations.filter((loc) => {
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

  // Row selection handler (Grid -> Schematic)
  const handleSelectRow = (loc: WarehouseLocation) => {
    setSelectedLocation(loc)
  }

  // Schematic click handler (Schematic -> Grid)
  const handleSelectBay = (aisle: string, bay: string) => {
    setAisleFilter(aisle)
    setBayFilter(bay)
    const match = locations.find(
      (l) => l.aisle.toUpperCase() === aisle.toUpperCase() && String(l.bay).padStart(2, '0') === bay,
    )
    if (match) {
      setSelectedLocation(match)
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

  const selectedSite = sites.find((s) => s.id === selectedSiteId)

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
              <div className="flex h-40 items-center justify-center text-xs text-muted-fg">
                <span>{t.addrNoLocations ?? 'No locations match these filters.'}</span>
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
                              autoFocus
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

        {/* Right Column: 2D Pure SVG Warehouse Plan Schematic (approx 40%) */}
        <div className="xl:col-span-5 sticky top-4">
          <WarehousePlanSchematic
            siteName={selectedSite?.name || 'Sakarya LM1'}
            selectedAisle={selectedLocation?.aisle}
            selectedBay={selectedLocation?.bay}
            selectedAddressId={selectedLocation?.addressId}
            onSelectBay={handleSelectBay}
            locations={locations}
          />
        </div>
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </section>
  )
}
