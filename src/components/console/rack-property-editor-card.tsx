'use client'

import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { formatIndustrialAddress, generateBarcode } from '@/lib/addressing-utils'
import type { WarehouseLocation } from '@/lib/types'

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

export interface RackPropertyEditorCardProps {
  rack: PalletRackNodeShape
  onUpdateRack: (updated: Partial<PalletRackNodeShape>) => Promise<void> | void
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
  const [zoneCode, setZoneCode] = useState(rack.zoneCode ?? '')
  const [accessMode, setAccessMode] = useState<'single-face' | 'dual-facing'>(
    rack.accessMode ?? 'single-face',
  )
  const [frontAisleLabel, setFrontAisleLabel] = useState(rack.frontAisleLabel ?? '')
  const [rearAisleLabel, setRearAisleLabel] = useState(rack.rearAisleLabel ?? '')
  const [signMountStyle, setSignMountStyle] = useState<'flag' | 'flush'>(
    rack.signMountStyle ?? 'flag',
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sync internal state when active rack changes
  useEffect(() => {
    setRowLabel(rack.rowLabel || rack.frontAisleLabel || '')
    setBayIndex(rack.bayIndex ?? 1)
    setZoneCode(rack.zoneCode ?? '')
    setAccessMode(rack.accessMode ?? 'single-face')
    setFrontAisleLabel(rack.frontAisleLabel ?? '')
    setRearAisleLabel(rack.rearAisleLabel ?? '')
    setSignMountStyle(rack.signMountStyle ?? 'flag')
    setError(null)
  }, [
    rack.id,
    rack.rowLabel,
    rack.bayIndex,
    rack.zoneCode,
    rack.accessMode,
    rack.frontAisleLabel,
    rack.rearAisleLabel,
    rack.signMountStyle,
  ])

  // Real-time formatted industrial address preview
  const addressPreviews = useMemo(() => {
    const cleanAisle = rowLabel.trim() || 'A'
    const cleanBay = Math.max(1, bayIndex || 1)
    const tiers = [
      { level: 0, letter: 'A', name: 'Zemin (A1-A2)' },
      { level: 1, letter: 'B', name: 'Kat 1 (B1-B2)' },
      { level: 2, letter: 'C', name: 'Kat 2 (C1-C2)' },
      { level: 3, letter: 'D', name: 'Kat 3 (D1-D2)' },
    ]

    return tiers.map((t) => {
      const addr1 = formatIndustrialAddress({
        aisle: cleanAisle,
        bay: cleanBay,
        level: t.level,
        position: 1,
      })
      const addr2 = formatIndustrialAddress({
        aisle: cleanAisle,
        bay: cleanBay,
        level: t.level,
        position: 2,
      })
      return {
        level: t.letter,
        name: t.name,
        primaryAddress: addr1,
        secondaryAddress: addr2,
        barcode: generateBarcode(addr1),
      }
    })
  }, [rowLabel, bayIndex])

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

    setIsSubmitting(true)
    setError(null)

    try {
      await onUpdateRack({
        rowLabel: trimmedAisle,
        bayIndex: Math.floor(bayIndex),
        zoneCode: zoneCode.trim(),
        accessMode,
        frontAisleLabel:
          accessMode === 'dual-facing' ? frontAisleLabel.trim() || trimmedAisle : trimmedAisle,
        rearAisleLabel: accessMode === 'dual-facing' ? rearAisleLabel.trim() : '',
        signMountStyle,
      })
    } catch (err: any) {
      setError(err?.message || 'Raf özellikleri kaydedilirken bir hata oluştu.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className={cn(
        'flex flex-col bg-slate-900/95 border border-slate-700/80 rounded-xl p-4 shadow-xl backdrop-blur-md text-slate-100 transition-all',
        className,
      )}
      data-testid="rack-property-editor-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div>
          <h4 className="text-sm font-semibold text-white flex items-center gap-2">
            <span>Raf Özellikleri Düzenleyici</span>
            <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-mono">
              Bay {String(bayIndex).padStart(2, '0')}
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
        <div className="mt-3 px-3 py-2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs">
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2.5">
          {/* Row / Aisle Label */}
          <div>
            <label htmlFor="rack-field-rowLabel" className="block text-[11px] font-medium text-slate-300 mb-1">
              Sıra / Koridor (Row Label) *
            </label>
            <input
              id="rack-field-rowLabel"
              name="rowLabel"
              type="text"
              value={rowLabel}
              onChange={(e) => setRowLabel(e.target.value)}
              disabled={!canEdit || isSubmitting}
              placeholder="örn. 01L, A, TCL"
              className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono font-semibold text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Bay Index */}
          <div>
            <label htmlFor="rack-field-bayIndex" className="block text-[11px] font-medium text-slate-300 mb-1">
              Göz No (Bay Index) *
            </label>
            <input
              id="rack-field-bayIndex"
              name="bayIndex"
              type="number"
              min={1}
              max={99}
              value={bayIndex}
              onChange={(e) => setBayIndex(parseInt(e.target.value, 10) || 1)}
              disabled={!canEdit || isSubmitting}
              className="w-full h-8 px-2.5 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono font-semibold text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
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
              Erişim Modu (Access Mode)
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
            Tabela Montaj Tipi (Sign Mount Style)
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
              <label htmlFor="rack-field-frontAisleLabel" className="block text-[10px] text-slate-400 mb-1">Ön Koridor</label>
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
              <label htmlFor="rack-field-rearAisleLabel" className="block text-[10px] text-slate-400 mb-1">Arka Koridor</label>
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

        {/* Live Formatted Industrial Address Preview Section */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Canlı Endüstriyel Adres Önizlemesi
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {locations.length > 0 ? `${locations.length} slot bağlı` : 'Format: A-02-D2'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {addressPreviews.map((preview) => (
              <div
                key={preview.level}
                className="p-1.5 rounded bg-slate-900/90 border border-slate-800/80 flex flex-col"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-semibold text-amber-400">{preview.level} Katı:</span>
                  <span className="font-mono text-blue-300 font-bold">{preview.primaryAddress}</span>
                </div>
                <span className="text-[9px] font-mono text-slate-500 truncate mt-0.5">
                  {preview.barcode}
                </span>
              </div>
            ))}
          </div>

          {locations.length > 0 && (
            <p className="mt-2 text-[10px] text-slate-400">
              Bu rafa ait <strong className="text-white">{locations.length}</strong> konum kaydının koridor, göz ve adres kodları otomatik güncellenecektir.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
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
