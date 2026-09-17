'use client'

import type { LocationStatus } from '@/lib/types'
import React, { useMemo, useState } from 'react'

export interface WarehouseLocationSummary {
  aisle: string
  bay: string
  status: LocationStatus
  addressId?: string
}

export interface WarehousePlanSchematicProps {
  siteName?: string
  selectedAisle?: string | null
  selectedBay?: string | null
  selectedAddressId?: string | null
  onSelectBay?: (aisle: string, bay: string) => void
  locations?: WarehouseLocationSummary[]
  className?: string
}

const AISLES = ['A', 'B', 'C', 'D']
const BAYS_PER_AISLE = 8
const BASE_WIDTH = 960
const BASE_HEIGHT = 640

// Y positions for Aisles A, B, C, D
const AISLE_Y_MAP: Record<string, number> = {
  A: 204,
  B: 248,
  C: 376,
  D: 420,
}

export function WarehousePlanSchematic({
  siteName = 'Sakarya LM1',
  selectedAisle,
  selectedBay,
  selectedAddressId,
  onSelectBay,
  locations = [],
  className = '',
}: WarehousePlanSchematicProps) {
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 })

  const handleZoomIn = () => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))
  const handleZoomOut = () => setZoom((z) => Math.max(0.6, +(z - 0.25).toFixed(2)))
  const handleResetView = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button === 0 && (e.target as SVGElement).tagName === 'svg') {
      setIsDragging(true)
      setDragOrigin({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragOrigin.x,
        y: e.clientY - dragOrigin.y,
      })
    }
  }

  const handleMouseUp = () => setIsDragging(false)

  // Map of bay key -> status summary
  const bayStatusMap = useMemo(() => {
    const map = new Map<string, { hasBlocked: boolean; hasQuarantine: boolean; count: number }>()
    for (const loc of locations) {
      const padBay = String(loc.bay).padStart(2, '0')
      const key = `${loc.aisle.toUpperCase()}-${padBay}`
      const entry = map.get(key) || { hasBlocked: false, hasQuarantine: false, count: 0 }
      entry.count++
      if (loc.status === 'Blocked') entry.hasBlocked = true
      if (loc.status === 'Quarantine') entry.hasQuarantine = true
      map.set(key, entry)
    }
    return map
  }, [locations])

  // Normalise selected values
  const selAisleNorm = selectedAisle ? selectedAisle.trim().toUpperCase() : null
  const selBayNorm = selectedBay ? String(selectedBay).trim().padStart(2, '0') : null

  return (
    <div
      className={`relative w-full h-full flex flex-col bg-slate-900 border border-slate-700/60 rounded-xl overflow-hidden select-none ${className}`}
      style={{ minHeight: 480 }}
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase font-mono">
            {siteName} · 2B Yerleşim Şeması
          </span>
          {selAisleNorm && selBayNorm && (
            <span className="ml-2 px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-red-950/80 border border-red-700/60 text-red-300">
              Göz: {selAisleNorm}-{selBayNorm}
            </span>
          )}
        </div>

        {/* View Controls */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-lg p-1 shadow-sm">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Yakınlaştır (+)"
            aria-label="Zoom In"
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Uzaklaştır (-)"
            aria-label="Zoom Out"
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <div className="w-px h-4 bg-slate-700 my-auto mx-0.5" />
          <button
            type="button"
            onClick={handleResetView}
            title="Görünümü Sıfırla"
            aria-label="Reset View"
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <span className="px-1.5 text-[11px] font-mono text-slate-400 font-semibold min-w-[38px] text-center">
            {Math.round(zoom * 100)}%
          </span>
        </div>
      </div>

      {/* SVG Container */}
      <div className="relative flex-1 w-full h-full overflow-hidden cursor-crosshair">
        <svg
          viewBox={`0 0 ${BASE_WIDTH} ${BASE_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <defs>
            {/* Blueprint Grid */}
            <pattern id="dt-floor-grid-ed" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#334155" strokeWidth="0.5" strokeOpacity="0.4" />
            </pattern>

            {/* Hazard Stripes for Truck Docks */}
            <pattern id="dt-dock-stripes-ed" width="12" height="12" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
              <rect width="6" height="12" fill="#F59E0B" />
              <rect x="6" width="6" height="12" fill="#1E293B" />
            </pattern>

            {/* Selected Bay Crimson Glow */}
            <filter id="dt-bay-glow-ed" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#DC2626" floodOpacity="0.85" />
            </filter>

            {/* Callout Drop Shadow */}
            <filter id="dt-callout-shadow-ed" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="rgba(0,0,0,0.5)" />
            </filter>
          </defs>

          {/* Interactive Zoom/Pan Transform Group */}
          <g
            transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
            style={{
              transformOrigin: `${BASE_WIDTH / 2}px ${BASE_HEIGHT / 2}px`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            {/* Warehouse Floor */}
            <rect x="24" y="24" width="912" height="592" rx="6" fill="#0B132B" stroke="#334155" strokeWidth="3" />
            <rect x="24" y="24" width="912" height="592" rx="6" fill="url(#dt-floor-grid-ed)" />

            {/* Perimeter Yellow Safety Walkway */}
            <rect
              x="36"
              y="36"
              width="888"
              height="568"
              rx="4"
              fill="none"
              stroke="#EAB308"
              strokeWidth="1.2"
              strokeDasharray="6 4"
            />

            {/* Structural Concrete Columns */}
            {[
              [24, 24],
              [328, 24],
              [632, 24],
              [936, 24],
              [24, 616],
              [328, 616],
              [632, 616],
              [936, 616],
              [24, 320],
              [936, 320],
            ].map(([cx = 0, cy = 0], idx) => (
              <rect
                key={idx}
                x={cx - 6}
                y={cy - 6}
                width="12"
                height="12"
                fill="#475569"
                stroke="#1E293B"
                strokeWidth="1"
                rx="1"
              />
            ))}

            {/* Loading Dock Doors (North Wall) */}
            {[
              { id: 'DOCK 01', x: 110, w: 70 },
              { id: 'DOCK 02', x: 210, w: 70 },
              { id: 'DOCK 03', x: 680, w: 70 },
              { id: 'DOCK 04', x: 780, w: 70 },
            ].map((dock) => (
              <g key={dock.id}>
                <rect x={dock.x} y="14" width={dock.w} height="12" fill="url(#dt-dock-stripes-ed)" stroke="#1E293B" strokeWidth="1" />
                <rect x={dock.x + 8} y="22" width={dock.w - 16} height="14" rx="2" fill="#0F172A" stroke="#475569" strokeWidth="1" />
                <text
                  x={dock.x + dock.w / 2}
                  y="33"
                  textAnchor="middle"
                  fill="#F8FAFC"
                  fontSize="9"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  {dock.id}
                </text>
              </g>
            ))}

            {/* Staging Area: Inbound (Left) */}
            <g>
              <rect
                x="60"
                y="54"
                width="370"
                height="56"
                rx="4"
                fill="#1E3A8A"
                fillOpacity="0.25"
                stroke="#3B82F6"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text x="245" y="78" textAnchor="middle" fill="#60A5FA" fontSize="11" fontWeight="bold">
                GİRİŞ MAL KABUL / INBOUND STAGING
              </text>
              <text x="245" y="96" textAnchor="middle" fill="#94A3B8" fontSize="9">
                4 Bekleme Şeridi · Kabul & Kalite Kontrol
              </text>
            </g>

            {/* Staging Area: Outbound (Right) */}
            <g>
              <rect
                x="530"
                y="54"
                width="370"
                height="56"
                rx="4"
                fill="#064E3B"
                fillOpacity="0.25"
                stroke="#10B981"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text x="715" y="78" textAnchor="middle" fill="#34D399" fontSize="11" fontWeight="bold">
                SEVKİYAT / OUTBOUND STAGING
              </text>
              <text x="715" y="96" textAnchor="middle" fill="#94A3B8" fontSize="9">
                4 Yükleme Şeridi · Çıkış & Sevk
              </text>
            </g>

            {/* Main Forklift Highway (Between Staging and Racks) */}
            <g>
              <rect x="55" y="128" width="850" height="52" fill="#1E293B" fillOpacity="0.4" stroke="#334155" strokeWidth="1" />
              <line x1="55" y1="154" x2="905" y2="154" stroke="#94A3B8" strokeWidth="1.5" strokeDasharray="12 8" />
              <text x="480" y="148" textAnchor="middle" fill="#CBD5E1" fontSize="10" fontWeight="600" letterSpacing="0.08em">
                ◄ FORKLİFT ANA TRANSİT KORİDORU ►
              </text>
            </g>

            {/* Operating Forklift Corridor between Rows B and C */}
            <g>
              <rect x="55" y="294" width="850" height="74" fill="#0F172A" fillOpacity="0.6" stroke="#1E293B" strokeWidth="1" />
              <line x1="55" y1="331" x2="905" y2="331" stroke="#64748B" strokeWidth="1" strokeDasharray="10 6" />
              <text x="480" y="335" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="500">
                FORKLİFT KORİDORU (KORİDOR 1)
              </text>
            </g>

            {/* Operating Forklift Corridor below Row D */}
            <g>
              <rect x="55" y="466" width="850" height="74" fill="#0F172A" fillOpacity="0.6" stroke="#1E293B" strokeWidth="1" />
              <line x1="55" y1="503" x2="905" y2="503" stroke="#64748B" strokeWidth="1" strokeDasharray="10 6" />
              <text x="480" y="507" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="500">
                FORKLİFT KORİDORU (KORİDOR 2)
              </text>
            </g>

            {/* RACK AISLES & BAYS */}
            {AISLES.map((aisle) => {
              const aisleY = AISLE_Y_MAP[aisle] || 200

              return (
                <g key={`aisle-${aisle}`}>
                  {/* Aisle Header Badge (Left) */}
                  <g>
                    <rect
                      x="55"
                      y={aisleY + 4}
                      width="66"
                      height="30"
                      rx="4"
                      fill="#0F172A"
                      stroke="#475569"
                      strokeWidth="1.5"
                    />
                    <text
                      x="88"
                      y={aisleY + 23}
                      textAnchor="middle"
                      fill="#F8FAFC"
                      fontSize="11"
                      fontWeight="bold"
                      letterSpacing="0.05em"
                    >
                      SIRA {aisle}
                    </text>
                  </g>

                  {/* 8 Bays per Aisle */}
                  {Array.from({ length: BAYS_PER_AISLE }, (_, i) => {
                    const bayIndex = i + 1
                    const padBay = String(bayIndex).padStart(2, '0')
                    const bx = 135 + (bayIndex - 1) * 92
                    const by = aisleY
                    const bw = 86
                    const bh = 38

                    const isSelected =
                      selAisleNorm === aisle &&
                      (selBayNorm === padBay || parseInt(selBayNorm || '0', 10) === bayIndex)

                    const bayKey = `${aisle}-${padBay}`
                    const summary = bayStatusMap.get(bayKey)

                    // Determine dot color
                    let dotColor = '#10B981' // Green (Active)
                    if (summary?.hasBlocked) {
                      dotColor = '#DC2626' // Red (Blocked)
                    } else if (summary?.hasQuarantine) {
                      dotColor = '#F59E0B' // Amber (Quarantine)
                    }

                    return (
                      <g
                        key={`bay-${aisle}-${bayIndex}`}
                        className="cursor-pointer transition-all duration-150"
                        onClick={() => onSelectBay?.(aisle, padBay)}
                      >
                        {/* Bay Rectangle */}
                        <rect
                          x={bx}
                          y={by}
                          width={bw}
                          height={bh}
                          rx="4"
                          fill={isSelected ? '#DC2626' : '#1E293B'}
                          stroke={isSelected ? '#991B1B' : '#475569'}
                          strokeWidth={isSelected ? 3 : 1.5}
                          filter={isSelected ? 'url(#dt-bay-glow-ed)' : undefined}
                        />

                        {/* Visual Upright Frame Markers at Left and Right */}
                        <line
                          x1={bx + 2}
                          y1={by + 4}
                          x2={bx + 2}
                          y2={by + bh - 4}
                          stroke={isSelected ? '#FEF2F2' : '#64748B'}
                          strokeWidth="2.5"
                        />
                        <line
                          x1={bx + bw - 2}
                          y1={by + 4}
                          x2={bx + bw - 2}
                          y2={by + bh - 4}
                          stroke={isSelected ? '#FEF2F2' : '#64748B'}
                          strokeWidth="2.5"
                        />

                        {/* Bay Number Text */}
                        <text
                          x={bx + bw / 2}
                          y={by + 24}
                          textAnchor="middle"
                          fill={isSelected ? '#FFFFFF' : '#E2E8F0'}
                          fontSize="13"
                          fontWeight={isSelected ? 'bold' : '600'}
                          fontFamily="monospace"
                        >
                          {padBay}
                        </text>

                        {/* Bay Status Dot */}
                        <circle cx={bx + bw - 10} cy={by + 10} r="3.5" fill={isSelected ? '#FFFFFF' : dotColor} />

                        {/* Highlight Floating Callout Badge */}
                        {isSelected && (
                          <g className="bay-callout" filter="url(#dt-callout-shadow-ed)">
                            {/* Triangle pointer */}
                            <polygon
                              points={`${bx + bw / 2},${by - 2} ${bx + bw / 2 - 6},${by - 9} ${bx + bw / 2 + 6},${by - 9}`}
                              fill="#0F172A"
                            />
                            {/* Callout box */}
                            <rect
                              x={bx + bw / 2 - 55}
                              y={by - 37}
                              width="110"
                              height="28"
                              rx="5"
                              fill="#0F172A"
                              stroke="#DC2626"
                              strokeWidth="1.5"
                            />
                            {/* Address ID text */}
                            <text
                              x={bx + bw / 2}
                              y={by - 19}
                              textAnchor="middle"
                              fill="#FFFFFF"
                              fontSize="11"
                              fontWeight="bold"
                              fontFamily="monospace"
                            >
                              {selectedAddressId || `${aisle}-${padBay}`}
                            </text>
                          </g>
                        )}
                      </g>
                    )
                  })}
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {/* Bottom Legend Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-400 font-medium">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            <span>Etkin</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            <span>Karantina</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
            <span>Bloke</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 border border-red-400 inline-block" />
            <span className="font-semibold text-red-300">Seçili Göz</span>
          </div>
        </div>
        <span className="text-[10px] text-slate-500">Saf 2B Vektör SVG · 0% WebGL / Canvas Yükü</span>
      </div>
    </div>
  )
}
