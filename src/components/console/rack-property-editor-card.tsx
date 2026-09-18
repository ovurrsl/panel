'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatIndustrialAddress, generateBarcode, levelToLetter } from '@/lib/addressing-utils'
import type { LocationStatus, WarehouseLocation } from '@/lib/types'

export interface PalletRackNodeShape {
  id: string
  type: string
  rowLabel?: string
  bayIndex?: number
  zoneCode?: string
  accessMode?: 'single-face' | 'dual-facing'
  frontAisleLabel?: string
  rearAisleLabel?: string
  namingStrategy?: 'aisle-pairs' | 'face-split' | 'odd-even'
  signMountStyle?: 'flag' | 'flush'
  position?: [number, number, number]
  rotation?: [number, number, number]
  levels?: number
  bayClearWidth?: number
  depth?: number
  uprightHeight?: number
}

export interface SlotDraftState {
  level: number
  position: number
  addressId: string
  status: LocationStatus
  maxWeight: number
  isCustomAddress: boolean
}

export interface RackPropertyEditorCardProps {
  rack: PalletRackNodeShape
  onUpdateRack: (
    updated: Partial<PalletRackNodeShape>,
    locationUpdates?: Partial<WarehouseLocation>[],
  ) => Promise<void> | void
  onClose: () => void
  locations?: WarehouseLocation[]
  canEdit?: boolean
  className?: string
}

export function RackPropertyEditorCard({
  rack,
  onUpdateRack,
  onClose,
  locations = [],
  canEdit = true,
  className = '',
}: RackPropertyEditorCardProps) {
  // Form State
  const [rowLabel, setRowLabel] = useState(rack.rowLabel || rack.frontAisleLabel || '')
  const [bayIndex, setBayIndex] = useState(rack.bayIndex ?? 1)
  const initialLevels = Math.min(
    15,
    Math.max(1, rack.levels ?? (locations.length > 0 ? Math.ceil(locations.length / 3) : 6)),
  )
  const [levels, setLevels] = useState<number>(initialLevels)
  const [zoneCode, setZoneCode] = useState(rack.zoneCode ?? '')
  const [accessMode, setAccessMode] = useState<'single-face' | 'dual-facing'>(
    rack.accessMode ?? 'single-face',
  )
  const [frontAisleLabel, setFrontAisleLabel] = useState(rack.frontAisleLabel ?? '')
  const [rearAisleLabel, setRearAisleLabel] = useState(rack.rearAisleLabel ?? '')
  const [signMountStyle, setSignMountStyle] = useState<'flag' | 'flush'>(
    rack.signMountStyle ?? 'flag',
  )

  // Active view tab inside editor card
  const [activeTab, setActiveTab] = useState<'general' | 'levels' | 'slots'>('general')
  const [selectedLevelFilter, setSelectedLevelFilter] = useState<number | 'all'>('all')

  // Slot drafts (each level has 3 side-by-side positions)
  const [slotDrafts, setSlotDrafts] = useState<SlotDraftState[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Determine positions per bay (3 for standard 2.7m beams, 2 for narrow)
  const positionsPerBay = (rack.bayClearWidth ?? 2.7) >= 2.5 ? 3 : 2

  // Sync internal state when active rack or locations change
  useEffect(() => {
    const curAisle = rack.rowLabel || rack.frontAisleLabel || ''
    const curBay = rack.bayIndex ?? 1
    const curLevels = Math.min(
      15,
      Math.max(1, rack.levels ?? (locations.length > 0 ? Math.ceil(locations.length / positionsPerBay) : 6)),
    )

    setRowLabel(curAisle)
    setBayIndex(curBay)
    setLevels(curLevels)
    setZoneCode(rack.zoneCode ?? '')
    setAccessMode(rack.accessMode ?? 'single-face')
    setFrontAisleLabel(rack.frontAisleLabel ?? '')
    setRearAisleLabel(rack.rearAisleLabel ?? '')
    setSignMountStyle(rack.signMountStyle ?? 'flag')
    setError(null)

    // Build initial slot drafts for all levels and positions
    const drafts: SlotDraftState[] = []
    for (let lvl = 0; lvl < curLevels; lvl++) {
      const lvlLetter = levelToLetter(lvl)
      for (let pos = 1; pos <= positionsPerBay; pos++) {
        // Find if an existing location record matches
        const existingLoc = locations.find((l) => {
          const matchLevel =
            l.level.toUpperCase() === lvlLetter ||
            l.level === String(lvl)
          const matchPos = String(l.position) === String(pos)
          return matchLevel && matchPos
        })

        const defaultAddr = formatIndustrialAddress({
          aisle: curAisle || 'A',
          bay: curBay,
          level: lvl,
          position: pos,
        })

        drafts.push({
          level: lvl,
          position: pos,
          addressId: existingLoc?.addressId || defaultAddr,
          status: existingLoc?.status || 'Active',
          maxWeight: existingLoc?.maxWeight ?? 1000,
          isCustomAddress: Boolean(existingLoc?.addressId && existingLoc.addressId !== defaultAddr),
        })
      }
    }
    setSlotDrafts(drafts)
  }, [
    rack.id,
    rack.rowLabel,
    rack.bayIndex,
    rack.levels,
    rack.zoneCode,
    rack.accessMode,
    rack.frontAisleLabel,
    rack.rearAisleLabel,
    rack.signMountStyle,
    rack.bayClearWidth,
    locations,
    positionsPerBay,
  ])

  // When aisle (rowLabel) or bayIndex changes, update default addresses
  const handleAisleOrBayChange = (newAisle: string, newBay: number) => {
    setSlotDrafts((prev) =>
      prev.map((slot) => {
        if (slot.isCustomAddress) return slot
        const standardAddr = formatIndustrialAddress({
          aisle: newAisle || 'A',
          bay: newBay,
          level: slot.level,
          position: slot.position,
        })
        return {
          ...slot,
          addressId: standardAddr,
        }
      }),
    )
  }

  // When level count changes, expand or trim slotDrafts
  const handleLevelsChange = (newLevelCount: number) => {
    const clamped = Math.max(1, Math.min(15, newLevelCount))
    setLevels(clamped)
    setSlotDrafts((prev) => {
      const nextDrafts: SlotDraftState[] = []
      for (let lvl = 0; lvl < clamped; lvl++) {
        for (let pos = 1; pos <= positionsPerBay; pos++) {
          const existingDraft = prev.find((d) => d.level === lvl && d.position === pos)
          if (existingDraft) {
            nextDrafts.push(existingDraft)
          } else {
            const standardAddr = formatIndustrialAddress({
              aisle: rowLabel || 'A',
              bay: bayIndex,
              level: lvl,
              position: pos,
            })
            nextDrafts.push({
              level: lvl,
              position: pos,
              addressId: standardAddr,
              status: 'Active',
              maxWeight: 1000,
              isCustomAddress: false,
            })
          }
        }
      }
      return nextDrafts
    })
  }

  // Slot modification handlers
  const updateSlot = (level: number, position: number, patch: Partial<SlotDraftState>) => {
    setSlotDrafts((prev) =>
      prev.map((slot) => {
        if (slot.level === level && slot.position === position) {
          return { ...slot, ...patch }
        }
        return slot
      }),
    )
  }

  // Reset all addresses to standard enterprise pattern
  const resetAllAddressesToStandard = () => {
    setSlotDrafts((prev) =>
      prev.map((slot) => ({
        ...slot,
        addressId: formatIndustrialAddress({
          aisle: rowLabel || 'A',
          bay: bayIndex,
          level: slot.level,
          position: slot.position,
        }),
        isCustomAddress: false,
      })),
    )
  }

  // Batch status update
  const setAllSlotsStatus = (status: LocationStatus) => {
    setSlotDrafts((prev) => prev.map((s) => ({ ...s, status })))
  }

  // Real-time address previews for all levels
  const addressPreviews = useMemo(() => {
    const cleanAisle = rowLabel.trim() || 'A'
    const cleanBay = Math.max(1, bayIndex || 1)

    const levelList = Array.from({ length: levels }, (_, i) => i)

    return levelList.map((lvl) => {
      const letter = levelToLetter(lvl)
      const lvlSlots = slotDrafts.filter((s) => s.level === lvl)
      const addr1 =
        lvlSlots.find((s) => s.position === 1)?.addressId ||
        formatIndustrialAddress({ aisle: cleanAisle, bay: cleanBay, level: lvl, position: 1 })
      const addr2 =
        lvlSlots.find((s) => s.position === 2)?.addressId ||
        formatIndustrialAddress({ aisle: cleanAisle, bay: cleanBay, level: lvl, position: 2 })
      const addr3 =
        lvlSlots.find((s) => s.position === 3)?.addressId ||
        formatIndustrialAddress({ aisle: cleanAisle, bay: cleanBay, level: lvl, position: 3 })

      return {
        levelIndex: lvl,
        letter,
        name: lvl === 0 ? `Zemin (${letter})` : `Kat ${lvl} (${letter})`,
        primaryAddress: addr1,
        secondaryAddress: addr2,
        tertiaryAddress: addr3,
        barcode: generateBarcode(addr1),
      }
    })
  }, [rowLabel, bayIndex, levels, slotDrafts])

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canEdit) return

    const trimmedAisle = rowLabel.trim()
    if (!trimmedAisle) {
      setError('Sıra / Koridor adı (Row Label) zorunludur.')
      return
    }

    if (bayIndex < 1) {
      setError('Göz indeksi (Bay Index) en az 1 olmalıdır.')
      return
    }

    if (levels < 1 || levels > 15) {
      setError('Kat sayısı (Levels) 1 ile 15 arasında olmalıdır.')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      const updatedRack: Partial<PalletRackNodeShape> = {
        rowLabel: trimmedAisle,
        bayIndex: Math.floor(bayIndex),
        levels: Math.floor(levels),
        zoneCode: zoneCode.trim(),
        accessMode,
        frontAisleLabel:
          accessMode === 'dual-facing' ? frontAisleLabel.trim() || trimmedAisle : trimmedAisle,
        rearAisleLabel: accessMode === 'dual-facing' ? rearAisleLabel.trim() : '',
        signMountStyle,
      }

      // Synthesize location updates for all active slots in this rack
      const locationUpdates: Partial<WarehouseLocation>[] = slotDrafts.map((draft) => {
        const lvlLetter = levelToLetter(draft.level)
        const matchingLoc = locations.find((l) => {
          return (
            (l.level.toUpperCase() === lvlLetter || l.level === String(draft.level)) &&
            String(l.position) === String(draft.position)
          )
        })

        const finalAddress =
          draft.addressId.trim() ||
          formatIndustrialAddress({
            aisle: trimmedAisle,
            bay: bayIndex,
            level: draft.level,
            position: draft.position,
          })

        return {
          id: matchingLoc?.id,
          aisle: trimmedAisle,
          bay: String(bayIndex).padStart(2, '0'),
          level: lvlLetter,
          position: String(draft.position),
          addressId: finalAddress,
          barcode: generateBarcode(finalAddress),
          status: draft.status,
          maxWeight: draft.maxWeight,
          nodeId: rack.id,
        }
      })

      await onUpdateRack(updatedRack, locationUpdates)
    } catch (err: any) {
      setError(err?.message || 'Raf özellikleri kaydedilirken bir hata oluştu.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Filtered slot drafts for the active level selection
  const visibleDraftsByLevel = useMemo(() => {
    const grouped: Record<number, SlotDraftState[]> = {}
    for (const draft of slotDrafts) {
      if (selectedLevelFilter !== 'all' && draft.level !== selectedLevelFilter) continue
      const list = grouped[draft.level] ?? (grouped[draft.level] = [])
      list.push(draft)
    }
    return grouped
  }, [slotDrafts, selectedLevelFilter])

  return (
    <div
      className={cn(
        'flex flex-col bg-slate-900/95 border border-slate-700/80 rounded-xl p-4 shadow-2xl backdrop-blur-md text-slate-100 transition-all max-h-[85vh] overflow-y-auto',
        className,
      )}
      data-testid="rack-property-editor-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800 shrink-0">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>Raf & Konum Düzenleyici</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-mono">
              Bay {String(bayIndex).padStart(2, '0')}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono">
              {levels} Kat • {positionsPerBay} Palet/Kat
            </span>
          </h4>
          <p className="text-[11px] font-mono text-slate-400 truncate max-w-[280px]">
            ID: {rack.id}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="close-editor-button"
          title="Kapat"
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="mt-3 px-3 py-2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs shrink-0">
          {error}
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1 mt-3 p-1 rounded-lg bg-slate-950/70 border border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={cn(
            'flex-1 py-1 px-2 rounded text-xs font-medium transition-colors',
            activeTab === 'general'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900',
          )}
        >
          Genel & Geometri
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('levels')}
          className={cn(
            'flex-1 py-1 px-2 rounded text-xs font-medium transition-colors',
            activeTab === 'levels'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900',
          )}
        >
          Katlar ({levels})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('slots')}
          className={cn(
            'flex-1 py-1 px-2 rounded text-xs font-medium transition-colors',
            activeTab === 'slots'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900',
          )}
        >
          Palet Yuvaları ({levels * positionsPerBay})
        </button>
      </div>

      {/* Main Form Body */}
      <form onSubmit={handleSubmit} className="mt-3 space-y-3 flex-1">
        {/* TAB 1: GENERAL & GEOMETRY */}
        {activeTab === 'general' && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
              {/* Row / Aisle Label */}
              <div>
                <label htmlFor="rack-field-rowLabel" className="block text-[11px] font-medium text-slate-300 mb-1">
                  Sıra / Koridor *
                </label>
                <input
                  id="rack-field-rowLabel"
                  name="rowLabel"
                  type="text"
                  value={rowLabel}
                  onChange={(e) => {
                    setRowLabel(e.target.value)
                    handleAisleOrBayChange(e.target.value, bayIndex)
                  }}
                  disabled={!canEdit || isSubmitting}
                  placeholder="örn. 01L, A, TCL"
                  className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono font-semibold text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Bay Index */}
              <div>
                <label htmlFor="rack-field-bayIndex" className="block text-[11px] font-medium text-slate-300 mb-1">
                  Göz No (Bay) *
                </label>
                <input
                  id="rack-field-bayIndex"
                  name="bayIndex"
                  type="number"
                  min={1}
                  max={99}
                  value={bayIndex}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10) || 1
                    setBayIndex(parsed)
                    handleAisleOrBayChange(rowLabel, parsed)
                  }}
                  disabled={!canEdit || isSubmitting}
                  className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono font-semibold text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Levels (Kat Sayısı) */}
              <div>
                <label htmlFor="rack-field-levels" className="block text-[11px] font-medium text-slate-300 mb-1">
                  Kat Sayısı *
                </label>
                <div className="flex items-center gap-1">
                  <input
                    id="rack-field-levels"
                    name="levels"
                    type="number"
                    min={1}
                    max={15}
                    value={levels}
                    onChange={(e) => handleLevelsChange(parseInt(e.target.value, 10) || 1)}
                    disabled={!canEdit || isSubmitting}
                    className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono font-semibold text-white focus:outline-none focus:border-blue-500 transition-colors"
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      onClick={() => handleLevelsChange(levels + 1)}
                      disabled={!canEdit || isSubmitting || levels >= 15}
                      className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[9px] text-slate-300"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLevelsChange(levels - 1)}
                      disabled={!canEdit || isSubmitting || levels <= 1}
                      className="px-1 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[9px] text-slate-300"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {/* Zone Code */}
              <div>
                <label htmlFor="rack-field-zoneCode" className="block text-[11px] font-medium text-slate-300 mb-1">
                  Bölge (Zone Code)
                </label>
                <input
                  id="rack-field-zoneCode"
                  name="zoneCode"
                  type="text"
                  value={zoneCode}
                  onChange={(e) => setZoneCode(e.target.value)}
                  disabled={!canEdit || isSubmitting}
                  placeholder="örn. Z1, TCA, Ambient"
                  className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Access Mode */}
              <div>
                <label htmlFor="rack-field-accessMode" className="block text-[11px] font-medium text-slate-300 mb-1">
                  Erişim Modu
                </label>
                <select
                  id="rack-field-accessMode"
                  name="accessMode"
                  value={accessMode}
                  onChange={(e) => setAccessMode(e.target.value as 'single-face' | 'dual-facing')}
                  disabled={!canEdit || isSubmitting}
                  className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="single-face">Tek Yönlü (Single-Face)</option>
                  <option value="dual-facing">Çift Yönlü (Dual-Facing)</option>
                </select>
              </div>
            </div>

            {/* Sign Mount Style */}
            <div>
              <label htmlFor="rack-field-signMountStyle" className="block text-[11px] font-medium text-slate-300 mb-1">
                Tabela Montaj Tipi
              </label>
              <select
                id="rack-field-signMountStyle"
                name="signMountStyle"
                value={signMountStyle}
                onChange={(e) => setSignMountStyle(e.target.value as 'flag' | 'flush')}
                disabled={!canEdit || isSubmitting}
                className="w-full h-8 px-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500 transition-colors"
              >
                <option value="flag">Bayrak (Flag - Koridora Çıkıntılı)</option>
                <option value="flush">Düz (Flush - Dikmeye Sıfır)</option>
              </select>
            </div>

            {/* Dual-Facing specific aisle split fields */}
            {accessMode === 'dual-facing' && (
              <div className="grid grid-cols-2 gap-2.5 p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                <div>
                  <label htmlFor="rack-field-frontAisleLabel" className="block text-[10px] text-slate-400 mb-1">
                    Ön Koridor
                  </label>
                  <input
                    id="rack-field-frontAisleLabel"
                    name="frontAisleLabel"
                    type="text"
                    value={frontAisleLabel}
                    onChange={(e) => setFrontAisleLabel(e.target.value)}
                    disabled={!canEdit || isSubmitting}
                    placeholder={rowLabel || 'A'}
                    className="w-full h-7 px-2 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                  />
                </div>
                <div>
                  <label htmlFor="rack-field-rearAisleLabel" className="block text-[10px] text-slate-400 mb-1">
                    Arka Koridor
                  </label>
                  <input
                    id="rack-field-rearAisleLabel"
                    name="rearAisleLabel"
                    type="text"
                    value={rearAisleLabel}
                    onChange={(e) => setRearAisleLabel(e.target.value)}
                    disabled={!canEdit || isSubmitting}
                    placeholder="örn. B"
                    className="w-full h-7 px-2 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: LEVELS SUMMARY & QUICK PREVIEW */}
        {activeTab === 'levels' && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Toplam {levels} Kat Seviyesi Tanımlı</span>
              <span>Her Katta {positionsPerBay} Palet Yeri</span>
            </div>

            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {addressPreviews.map((preview) => (
                <div
                  key={preview.letter}
                  className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold font-mono text-xs">
                      {preview.letter}
                    </span>
                    <div>
                      <span className="text-xs font-semibold text-slate-200">{preview.name}</span>
                      <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono text-blue-300">
                        <span>{preview.primaryAddress}</span>
                        <span>•</span>
                        <span>{preview.secondaryAddress}</span>
                        {preview.tertiaryAddress && (
                          <>
                            <span>•</span>
                            <span>{preview.tertiaryAddress}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLevelFilter(preview.levelIndex)
                      setActiveTab('slots')
                    }}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-medium text-slate-300"
                  >
                    Yuvaları Düzenle →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: SLOTS & ADDRESSES (3 PALLETS PER BAY) */}
        {activeTab === 'slots' && (
          <div className="space-y-3">
            {/* Level Selector Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => setSelectedLevelFilter('all')}
                className={cn(
                  'px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors shrink-0',
                  selectedLevelFilter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-white',
                )}
              >
                Tümü
              </button>
              {Array.from({ length: levels }, (_, idx) => {
                const letter = levelToLetter(idx)
                return (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setSelectedLevelFilter(idx)}
                    className={cn(
                      'px-2 py-0.5 rounded text-[11px] font-mono font-semibold transition-colors shrink-0',
                      selectedLevelFilter === idx
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-950 text-slate-400 hover:text-white',
                    )}
                  >
                    Kat {letter}
                  </button>
                )
              })}
            </div>

            {/* Quick Actions Row */}
            <div className="flex items-center justify-between gap-1 text-[10px]">
              <button
                type="button"
                onClick={resetAllAddressesToStandard}
                disabled={!canEdit || isSubmitting}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                ↺ Adresleri Standart Formatla
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAllSlotsStatus('Active')}
                  disabled={!canEdit || isSubmitting}
                  className="px-2 py-1 rounded bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800"
                >
                  Tümü Aktif
                </button>
                <button
                  type="button"
                  onClick={() => setAllSlotsStatus('Blocked')}
                  disabled={!canEdit || isSubmitting}
                  className="px-2 py-1 rounded bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800"
                >
                  Tümü Kilitli
                </button>
              </div>
            </div>

            {/* Slots List Grouped by Level */}
            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {Object.entries(visibleDraftsByLevel).map(([lvlStr, slots]) => {
                const lvlNum = parseInt(lvlStr, 10)
                const lvlLetter = levelToLetter(lvlNum)
                return (
                  <div
                    key={lvlStr}
                    className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-1.5">
                      <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        Kat {lvlLetter} ({lvlNum === 0 ? 'Zemin' : `${lvlNum}. Kat`})
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {slots.length} Palet Konumu
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      {slots.map((slot) => (
                        <div
                          key={`${slot.level}-${slot.position}`}
                          className="p-2 rounded bg-slate-900/90 border border-slate-800 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono font-bold text-blue-400">
                              Pozisyon {slot.position}
                            </span>
                            <span
                              className={cn(
                                'px-1 rounded text-[9px] font-semibold',
                                slot.status === 'Active' && 'bg-emerald-500/20 text-emerald-400',
                                slot.status === 'Blocked' && 'bg-rose-500/20 text-rose-400',
                                slot.status === 'Quarantine' && 'bg-amber-500/20 text-amber-400',
                                slot.status === 'Maintenance' && 'bg-blue-500/20 text-blue-400',
                              )}
                            >
                              {slot.status}
                            </span>
                          </div>

                          {/* Address ID input */}
                          <div>
                            <label className="block text-[9px] text-slate-400">Adres Kodu</label>
                            <input
                              type="text"
                              value={slot.addressId}
                              onChange={(e) =>
                                updateSlot(slot.level, slot.position, {
                                  addressId: e.target.value,
                                  isCustomAddress: true,
                                })
                              }
                              disabled={!canEdit || isSubmitting}
                              className="w-full h-6 px-1.5 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono font-bold text-white focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          {/* Status and Max Weight */}
                          <div className="grid grid-cols-2 gap-1">
                            <div>
                              <label className="block text-[9px] text-slate-400">Durum</label>
                              <select
                                value={slot.status}
                                onChange={(e) =>
                                  updateSlot(slot.level, slot.position, {
                                    status: e.target.value as LocationStatus,
                                  })
                                }
                                disabled={!canEdit || isSubmitting}
                                className="w-full h-6 px-1 rounded bg-slate-950 border border-slate-700 text-[10px] text-white"
                              >
                                <option value="Active">Active</option>
                                <option value="Blocked">Blocked</option>
                                <option value="Quarantine">Quarantine</option>
                                <option value="Maintenance">Maintenance</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-[9px] text-slate-400">Kapasite (kg)</label>
                              <input
                                type="number"
                                value={slot.maxWeight}
                                onChange={(e) =>
                                  updateSlot(slot.level, slot.position, {
                                    maxWeight: parseInt(e.target.value, 10) || 1000,
                                  })
                                }
                                disabled={!canEdit || isSubmitting}
                                className="w-full h-6 px-1 rounded bg-slate-950 border border-slate-700 text-[10px] font-mono text-white"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Live Formatted Industrial Address Preview Banner */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Canlı Endüstriyel Adres Önizlemesi
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {levels} Kat × {positionsPerBay} Palet = {levels * positionsPerBay} Yuva
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 max-h-[90px] overflow-y-auto">
            {addressPreviews.slice(0, 6).map((preview) => (
              <div
                key={preview.letter}
                className="p-1.5 rounded bg-slate-900/90 border border-slate-800/80 flex flex-col text-[10px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-amber-400">{preview.letter} Katı:</span>
                  <span className="font-mono text-blue-300 font-bold">{preview.primaryAddress}</span>
                </div>
                <span className="text-[9px] font-mono text-slate-500 truncate mt-0.5">
                  {preview.secondaryAddress} • {preview.tertiaryAddress}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            İptal
          </button>
          {canEdit && (
            <button
              type="submit"
              data-testid="save-rack-button"
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Kaydediliyor...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Rafı ve Adresleri Güncelle</span>
                </>
              )}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
