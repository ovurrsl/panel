'use client'

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { Maximize2, Minus, Plus } from 'lucide-react'
import type { WarehouseLocation } from '@/lib/types'

// ── Types ───────────────────────────────────────────────────────────────────

export interface PalletRackNodeShape {
  id: string
  type?: string
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
  depthPositions?: number
  palletPreset?: string
  palletsPerLevel?: number | null
}

export interface FloorplanPreviewScene {
  nodes?: Record<string, PalletRackNodeShape>
  graph?: { nodes?: Record<string, PalletRackNodeShape> }
}

export type FloorplanGeometry =
  | {
      kind: 'group'
      transform?: { translation?: [number, number]; rotation?: number }
      opacity?: number
      children?: FloorplanGeometry[]
    }
  | {
      kind: 'rect'
      x: number
      y: number
      width: number
      height: number
      fill?: string
      fillOpacity?: number
      stroke?: string
      strokeWidth?: number
      strokeDasharray?: string
      rx?: number
      ry?: number
      opacity?: number
      metadata?: Record<string, unknown>
    }
  | {
      kind: 'circle'
      cx: number
      cy: number
      r: number
      fill?: string
      fillOpacity?: number
      stroke?: string
      strokeWidth?: number
      opacity?: number
    }
  | {
      kind: 'line'
      x1: number
      y1: number
      x2: number
      y2: number
      stroke?: string
      strokeWidth?: number
      strokeDasharray?: string
      opacity?: number
    }
  | {
      kind: 'text'
      x: number
      y: number
      text: string
      fontSize?: number
      fontWeight?: string | number
      fontFamily?: string
      fill?: string
      stroke?: string
      strokeWidth?: number
      textAnchor?: 'start' | 'middle' | 'end'
      dominantBaseline?: 'auto' | 'central' | 'hanging' | 'middle'
      opacity?: number
      upright?: boolean
      metadata?: Record<string, unknown>
    }
  | {
      kind: 'path'
      d: string
      fill?: string
      fillOpacity?: number
      stroke?: string
      strokeWidth?: number
      opacity?: number
    }

export interface Interactive2DCanvasProps {
  scene?: FloorplanPreviewScene | null
  selectedRackId?: string | null
  selectedRowLabel?: string | null
  onSelectRack?: (rack: PalletRackNodeShape | null) => void
  onSelectRow?: (rowLabel: string | null) => void
  hoveredRackId?: string | null
  onHoverRack?: (rackId: string | null) => void
  width?: number | string
  height?: number | string
  className?: string
  siteName?: string
  activeLevelFilter?: string | null
  locations?: WarehouseLocation[]
}

interface FloorplanViewBox {
  x: number
  y: number
  width: number
  height: number
}

interface FloorplanBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface RenderableRackEntry {
  id: string
  node: PalletRackNodeShape
  geometry: FloorplanGeometry
  bounds: FloorplanBounds
  rowLabel: string
  bayIndex: number
}

interface RenderableSlabEntry {
  id: string
  points: string
}

interface RenderableWallEntry {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

interface RenderableColumnEntry {
  id: string
  x: number
  y: number
  width: number
  height: number
  isRound: boolean
  r: number
}

const DEFAULT_VIEW_BOX: FloorplanViewBox = { x: -30, y: -40, width: 80, height: 80 }

// ── Pure SVG Renderer for FloorplanGeometry ─────────────────────────────────

function renderFloorplanGeometry(g: FloorplanGeometry, key: string | number): React.ReactNode {
  if (!g) return null
  switch (g.kind) {
    case 'group': {
      const t = g.transform as any
      const tx = t?.translate?.[0] ?? t?.translation?.[0] ?? 0
      const ty = t?.translate?.[1] ?? t?.translation?.[1] ?? 0
      const rot = t?.rotate ?? t?.rotation ?? 0
      const rotDeg = ((rot) * 180) / Math.PI
      const transform = g.transform ? `translate(${tx} ${ty}) rotate(${rotDeg})` : undefined
      return (
        <g key={key} transform={transform} opacity={g.opacity}>
          {g.children?.map((child, i) => renderFloorplanGeometry(child, `${key}-${i}`))}
        </g>
      )
    }
    case 'rect': {
      return (
        <rect
          key={key}
          x={g.x}
          y={g.y}
          width={Math.max(0, g.width)}
          height={Math.max(0, g.height)}
          fill={g.fill ?? 'none'}
          fillOpacity={g.fillOpacity}
          stroke={g.stroke}
          strokeWidth={g.strokeWidth}
          strokeDasharray={g.strokeDasharray}
          rx={g.rx}
          ry={g.ry}
          opacity={g.opacity}
        />
      )
    }
    case 'circle': {
      return (
        <circle
          key={key}
          cx={g.cx}
          cy={g.cy}
          r={Math.max(0, g.r)}
          fill={g.fill ?? 'none'}
          fillOpacity={g.fillOpacity}
          stroke={g.stroke}
          strokeWidth={g.strokeWidth}
          opacity={g.opacity}
        />
      )
    }
    case 'line': {
      return (
        <line
          key={key}
          x1={g.x1}
          y1={g.y1}
          x2={g.x2}
          y2={g.y2}
          stroke={g.stroke}
          strokeWidth={g.strokeWidth}
          strokeDasharray={g.strokeDasharray}
          opacity={g.opacity}
        />
      )
    }
    case 'text': {
      return (
        <text
          key={key}
          x={g.x}
          y={g.y}
          fill={g.fill ?? '#0f172a'}
          fontSize={g.fontSize ?? 0.2}
          fontWeight={g.fontWeight ?? 'normal'}
          fontFamily={g.fontFamily ?? 'system-ui, -apple-system, sans-serif'}
          textAnchor={g.textAnchor ?? 'middle'}
          dominantBaseline={g.dominantBaseline ?? 'central'}
          opacity={g.opacity}
        >
          {g.text}
        </text>
      )
    }
    case 'path': {
      return (
        <path
          key={key}
          d={g.d}
          fill={g.fill ?? 'none'}
          fillOpacity={g.fillOpacity}
          stroke={g.stroke}
          strokeWidth={g.strokeWidth}
          opacity={g.opacity}
        />
      )
    }
    default:
      return null
  }
}

// ── Self-Contained Pallet Rack Floorplan Generator ──────────────────────────

function buildRackFloorplan(
  node: PalletRackNodeShape,
  isSelected: boolean,
  isHovered: boolean,
  isRowSelected: boolean,
  activeLevelFilter?: string | null,
  theme: 'paper' | 'dark' = 'paper',
): FloorplanGeometry {
  const isPaper = theme === 'paper'
  const width = node.bayClearWidth || 2.7
  const depth = node.depth || 1.1
  const posX = node.position?.[0] ?? 0
  const posZ = node.position?.[2] ?? 0
  const rotY = node.rotation?.[1] ?? 0

  const stroke = isSelected
    ? '#DC2626'
    : isRowSelected
      ? '#D97706'
      : isHovered
        ? '#EA580C'
        : isPaper
          ? '#64748B'
          : '#475569'
  const strokeWidth = isSelected ? 0.045 : isRowSelected ? 0.035 : isHovered ? 0.03 : 0.018
  const fill = isSelected
    ? '#FEE2E2'
    : isRowSelected
      ? '#FEF3C7'
      : isHovered
        ? (isPaper ? '#F8FAFC' : '#1E293B')
        : isPaper
          ? '#FFFFFF'
          : '#1E293B'
  const steelFill = isSelected ? '#DC2626' : isRowSelected ? '#D97706' : isPaper ? '#334155' : '#94A3B8'
  const beamStroke = isSelected ? '#DC2626' : isRowSelected ? '#D97706' : isPaper ? '#64748B' : '#475569'

  const children: FloorplanGeometry[] = []

  // 1. Outer rack perimeter bounding box
  children.push({
    kind: 'rect',
    x: -width / 2,
    y: -depth / 2,
    width,
    height: depth,
    fill,
    stroke,
    strokeWidth,
  })

  // 2. Upright steel posts at 4 corners
  const postW = 0.09
  const postD = 0.09
  const cornerPosts = [
    { x: -width / 2, y: -depth / 2 },
    { x: width / 2 - postW, y: -depth / 2 },
    { x: -width / 2, y: depth / 2 - postD },
    { x: width / 2 - postW, y: depth / 2 - postD },
  ]
  for (const cp of cornerPosts) {
    children.push({
      kind: 'rect',
      x: cp.x,
      y: cp.y,
      width: postW,
      height: postD,
      fill: steelFill,
      stroke: steelFill,
      strokeWidth: 0.005,
    })
  }

  // 3. Load Beams (front and rear structural crossbeams)
  children.push({
    kind: 'line',
    x1: -width / 2 + postW,
    y1: depth / 2 - 0.03,
    x2: width / 2 - postW,
    y2: depth / 2 - 0.03,
    stroke: beamStroke,
    strokeWidth: 0.02,
  })
  children.push({
    kind: 'line',
    x1: -width / 2 + postW,
    y1: -depth / 2 + 0.03,
    x2: width / 2 - postW,
    y2: -depth / 2 + 0.03,
    stroke: beamStroke,
    strokeWidth: 0.02,
  })

  // 4. Pallet Slot Outlines (1, 2, or 3 side-by-side positions per bay)
  const numSlots =
    node.palletsPerLevel != null && node.palletsPerLevel > 0
      ? Math.min(3, Math.max(1, node.palletsPerLevel))
      : (node.bayClearWidth ?? 2.7) >= 2.5
        ? 3
        : (node.bayClearWidth ?? 2.7) >= 1.6
          ? 2
          : 1
  const slotGap = 0.075
  const totalGap = (numSlots + 1) * slotGap
  const slotW = Math.max(0.4, (width - totalGap) / numSlots)
  const slotD = Math.min(1.2, depth * 0.9)

  for (let i = 0; i < numSlots; i++) {
    const slotCenterX = -width / 2 + slotGap + slotW / 2 + i * (slotW + slotGap)
    children.push({
      kind: 'rect',
      x: slotCenterX - slotW / 2,
      y: -slotD / 2,
      width: slotW,
      height: slotD,
      fill: 'none',
      stroke: isSelected ? '#EF4444' : '#94A3B8',
      strokeWidth: 0.012,
      strokeDasharray: '0.04 0.03',
    })
  }

  // 5. Bay Index Label ("01", "02", ...)
  const bayStr = String(node.bayIndex ?? 1).padStart(2, '0')
  children.push({
    kind: 'text',
    x: 0,
    y: depth / 2 + 0.24,
    text: bayStr,
    fontSize: 0.24,
    fontWeight: 'bold',
    fill: isSelected ? '#DC2626' : isPaper ? '#334155' : '#CBD5E1',
    fontFamily: 'monospace, system-ui',
    textAnchor: 'middle',
    dominantBaseline: 'central',
  })

  // 6. Aisle Header Sign (e.g. "SIRA 1L", "SIRA 1R") on bayIndex 1 or when explicitly set
  const cleanRow = (node.rowLabel || node.frontAisleLabel || '').trim()
  if (cleanRow && (node.bayIndex === 1 || isSelected)) {
    const headerTitle = cleanRow.toUpperCase().startsWith('SIRA') ? cleanRow : `SIRA ${cleanRow}`
    const signW = Math.max(1.2, headerTitle.length * 0.16 + 0.3)
    const signH = 0.38
    const signX = -width / 2 - signW - 0.25
    const signY = -signH / 2

    // Sign background pill
    children.push({
      kind: 'rect',
      x: signX,
      y: signY,
      width: signW,
      height: signH,
      fill: isRowSelected ? '#F59E0B' : '#FACC15',
      stroke: '#854D0E',
      strokeWidth: 0.03,
      rx: 0.08,
      ry: 0.08,
      metadata: { role: 'aisle-sign-bg', rowLabel: cleanRow },
    })

    // Sign text
    children.push({
      kind: 'text',
      x: signX + signW / 2,
      y: 0,
      text: headerTitle,
      fontSize: 0.22,
      fontWeight: 'bold',
      fill: '#000000',
      fontFamily: 'monospace, system-ui',
      textAnchor: 'middle',
      dominantBaseline: 'central',
      metadata: { role: 'aisle-sign-text', rowLabel: cleanRow },
    })
  }

  // 7. Active Level Filter Slot Addresses (e.g. 1L-01-A1, 1L-01-A2, 1L-01-A3)
  if (activeLevelFilter && activeLevelFilter !== 'All') {
    const lvlChar = activeLevelFilter.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(-1) || 'A'
    for (let i = 0; i < numSlots; i++) {
      const pos = i + 1
      const slotCenterX = -width / 2 + slotGap + slotW / 2 + i * (slotW + slotGap)
      const addr = `${cleanRow || 'A'}-${bayStr}-${lvlChar}${pos}`
      children.push({
        kind: 'text',
        x: slotCenterX,
        y: 0,
        text: addr,
        fontSize: numSlots === 3 ? 0.095 : 0.12,
        fontWeight: 'bold',
        fill: isPaper ? '#1E293B' : '#F1F5F9',
        fontFamily: 'monospace, system-ui',
        textAnchor: 'middle',
        dominantBaseline: 'central',
      })
    }
  }

  return {
    kind: 'group',
    transform: {
      translation: [posX, posZ],
      rotation: -rotY, // SVG rotation is clockwise, Three.js is counter-clockwise
    },
    children,
  }
}

// ── Math & Bounding Helpers ─────────────────────────────────────────────────

function padBounds(b: FloorplanBounds, padPct = 0.15): FloorplanBounds {
  const w = Math.max(b.maxX - b.minX, 10)
  const h = Math.max(b.maxY - b.minY, 10)
  return {
    minX: b.minX - w * padPct,
    minY: b.minY - h * padPct,
    maxX: b.maxX + w * padPct,
    maxY: b.maxY + h * padPct,
  }
}

function boundsToViewBox(b: FloorplanBounds): FloorplanViewBox {
  return {
    x: b.minX,
    y: b.minY,
    width: Math.max(b.maxX - b.minX, 5),
    height: Math.max(b.maxY - b.minY, 5),
  }
}

// ── Interactive 2D Canvas Component ─────────────────────────────────────────

export function Interactive2DCanvas({
  scene,
  selectedRackId,
  selectedRowLabel,
  onSelectRack,
  onSelectRow,
  hoveredRackId,
  onHoverRack,
  width = '100%',
  height = '100%',
  className = '',
  siteName = 'Warehouse Plan',
  activeLevelFilter,
}: Interactive2DCanvasProps) {
  const nodes = useMemo(() => {
    return scene?.graph?.nodes || scene?.nodes || {}
  }, [scene])

  const gridPatternId = useId().replace(/:/g, '')

  const [canvasTheme, setCanvasTheme] = useState<'paper' | 'dark'>('paper')
  const isPaper = canvasTheme === 'paper'

  // 1. Collect and process PalletRack and architectural nodes
  const { rackEntries, slabEntries, wallEntries, columnEntries, fullBounds } = useMemo(() => {
    const entries: RenderableRackEntry[] = []
    const slabs: RenderableSlabEntry[] = []
    const walls: RenderableWallEntry[] = []
    const cols: RenderableColumnEntry[] = []
    let bounds: FloorplanBounds | null = null

    const expandBounds = (x: number, y: number) => {
      if (!bounds) {
        bounds = { minX: x, maxX: x, minY: y, maxY: y }
      } else {
        bounds.minX = Math.min(bounds.minX, x)
        bounds.maxX = Math.max(bounds.maxX, x)
        bounds.minY = Math.min(bounds.minY, y)
        bounds.maxY = Math.max(bounds.maxY, y)
      }
    }

    for (const [id, raw] of Object.entries(nodes)) {
      if (!raw) continue
      const rawType = (raw as any).type || (raw as any).kind || ''

      // 1. Architectural Slab
      if (rawType === 'slab' || (raw as any).polygon) {
        const poly = (raw as any).polygon
        if (Array.isArray(poly) && poly.length > 0) {
          const pts = poly
            .map((pt: any) => {
              const px = pt[0] ?? 0
              const py = pt[1] ?? 0
              expandBounds(px, py)
              return `${px},${py}`
            })
            .join(' ')
          slabs.push({ id, points: pts })
        }
        continue
      }

      // 2. Architectural Wall
      if (rawType === 'wall' || ((raw as any).start && (raw as any).end)) {
        const start = (raw as any).start
        const end = (raw as any).end
        if (Array.isArray(start) && Array.isArray(end)) {
          const x1 = start[0] ?? 0
          const y1 = start[1] ?? 0
          const x2 = end[0] ?? 0
          const y2 = end[1] ?? 0
          expandBounds(x1, y1)
          expandBounds(x2, y2)
          walls.push({ id, x1, y1, x2, y2 })
        }
        continue
      }

      // 3. Architectural Column
      if (rawType === 'column' || (raw as any).crossSection) {
        const pos = (raw as any).position || [0, 0, 0]
        const cx = pos[0] ?? 0
        const cy = pos[2] ?? 0
        const w = (raw as any).width || 0.8
        const d = (raw as any).depth || 0.8
        const r = (raw as any).radius || w / 2
        const isRound = (raw as any).crossSection === 'round' || (raw as any).radius !== undefined
        expandBounds(cx - w / 2, cy - d / 2)
        expandBounds(cx + w / 2, cy + d / 2)
        cols.push({ id, x: cx - w / 2, y: cy - d / 2, width: w, height: d, isRound, r })
        continue
      }

      // 4. Warehouse Pallet Rack
      const isRack =
        rawType === 'warehouse:pallet-rack' ||
        (raw as any).rowLabel !== undefined ||
        (raw as any).bayIndex !== undefined

      if (!isRack) continue

      const rackNode: PalletRackNodeShape = {
        ...raw,
        id: raw.id || id,
        rowLabel: raw.rowLabel || raw.frontAisleLabel || '',
        bayIndex: raw.bayIndex ?? 1,
      }

      const isSelected = id === selectedRackId
      const isHovered = id === hoveredRackId
      const isRowSelected = Boolean(
        selectedRowLabel && rackNode.rowLabel?.toUpperCase() === selectedRowLabel.toUpperCase(),
      )

      const geom = buildRackFloorplan(rackNode, isSelected, isHovered, isRowSelected, activeLevelFilter, canvasTheme)

      const posX = rackNode.position?.[0] ?? 0
      const posZ = rackNode.position?.[2] ?? 0
      const w = rackNode.bayClearWidth || 2.7
      const d = rackNode.depth || 1.1

      expandBounds(posX - w / 2 - 1.5, posZ - d / 2 - 0.5)
      expandBounds(posX + w / 2 + 1.5, posZ + d / 2 + 0.5)

      entries.push({
        id,
        node: rackNode,
        geometry: geom,
        bounds: {
          minX: posX - w / 2 - 1.5,
          minY: posZ - d / 2 - 0.5,
          maxX: posX + w / 2 + 1.5,
          maxY: posZ + d / 2 + 0.5,
        },
        rowLabel: rackNode.rowLabel || '',
        bayIndex: rackNode.bayIndex || 1,
      })
    }

    return {
      rackEntries: entries,
      slabEntries: slabs,
      wallEntries: walls,
      columnEntries: cols,
      fullBounds: bounds ? padBounds(bounds, 0.06) : null,
    }
  }, [nodes, selectedRackId, hoveredRackId, selectedRowLabel, activeLevelFilter, canvasTheme])

  // Aisle Sign badges for click-to-select whole row
  const aisleHeaders = useMemo(() => {
    const map = new Map<string, { x: number; y: number; label: string }>()
    for (const { node } of rackEntries) {
      const row = (node.rowLabel || node.frontAisleLabel || '').trim()
      if (!row) continue
      if (node.bayIndex === 1 || !map.has(row)) {
        const posX = node.position?.[0] ?? 0
        const posZ = node.position?.[2] ?? 0
        const w = node.bayClearWidth || 2.7
        map.set(row, {
          x: posX - w / 2 - 1.2,
          y: posZ,
          label: row.toUpperCase().startsWith('SIRA') ? row : `SIRA ${row}`,
        })
      }
    }
    return Array.from(map.entries()).map(([rowLabel, data]) => ({ rowLabel, ...data }))
  }, [rackEntries])

  // 2. Viewport & Pan/Zoom State
  const [viewBox, setViewBox] = useState<FloorplanViewBox>(() => {
    return fullBounds ? boundsToViewBox(fullBounds) : DEFAULT_VIEW_BOX
  })

  // Fit view once on load, and auto-fit whenever scene nodes populate
  const prevCountRef = useRef(0)
  useEffect(() => {
    if (fullBounds && rackEntries.length > 0) {
      if (prevCountRef.current === 0 || Math.abs(rackEntries.length - prevCountRef.current) > 10) {
        setViewBox(boundsToViewBox(fullBounds))
      }
      prevCountRef.current = rackEntries.length
    }
  }, [fullBounds, rackEntries.length])

  const svgRef = useRef<SVGSVGElement | null>(null)
  const isPointerDownRef = useRef(false)
  const pointerStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const viewBoxStartRef = useRef<FloorplanViewBox>(viewBox)
  const hasMovedRef = useRef(false)
  const [isPanning, setIsPanning] = useState(false)

  // Zoom function
  const zoom = useCallback((scaleFactor: number, clientCenter?: { x: number; y: number }) => {
    setViewBox((prev) => {
      let focalX = prev.x + prev.width / 2
      let focalY = prev.y + prev.height / 2

      if (clientCenter && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect()
        const normX = (clientCenter.x - rect.left) / rect.width
        const normY = (clientCenter.y - rect.top) / rect.height
        focalX = prev.x + normX * prev.width
        focalY = prev.y + normY * prev.height
      }

      const nextWidth = Math.max(2, Math.min(500, prev.width * scaleFactor))
      const nextHeight = Math.max(2, Math.min(500, prev.height * scaleFactor))

      return {
        x: focalX - (focalX - prev.x) * (nextWidth / prev.width),
        y: focalY - (focalY - prev.y) * (nextHeight / prev.height),
        width: nextWidth,
        height: nextHeight,
      }
    })
  }, [])

  // Fit View
  const fitView = useCallback(() => {
    if (fullBounds) {
      setViewBox(boundsToViewBox(fullBounds))
    } else {
      setViewBox(DEFAULT_VIEW_BOX)
    }
  }, [fullBounds])

  // Wheel Zoom handler
  const handleWheel = (e: ReactWheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    const factor = e.deltaY > 0 ? 1.15 : 0.85
    zoom(factor, { x: e.clientX, y: e.clientY })
  }

  // Pointer Down (Start Pan)
  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement | SVGGElement>) => {
    if (e.button !== 0 && e.button !== 1) return
    isPointerDownRef.current = true
    hasMovedRef.current = false
    setIsPanning(true)
    pointerStartRef.current = { x: e.clientX, y: e.clientY }
    viewBoxStartRef.current = viewBox
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }

  // Pointer Move (Pan ViewBox)
  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!isPointerDownRef.current || !svgRef.current) return
    const dxPx = e.clientX - pointerStartRef.current.x
    const dyPx = e.clientY - pointerStartRef.current.y

    if (Math.hypot(dxPx, dyPx) > 4) {
      hasMovedRef.current = true
    }

    const rect = svgRef.current.getBoundingClientRect()
    const worldDx = (dxPx / rect.width) * viewBoxStartRef.current.width
    const worldDy = (dyPx / rect.height) * viewBoxStartRef.current.height

    setViewBox({
      x: viewBoxStartRef.current.x - worldDx,
      y: viewBoxStartRef.current.y - worldDy,
      width: viewBoxStartRef.current.width,
      height: viewBoxStartRef.current.height,
    })
  }

  // Pointer Up (End Pan)
  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement | SVGGElement>) => {
    isPointerDownRef.current = false
    setIsPanning(false)
    try {
      ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
    } catch (_e) {}
  }

  // Keyboard Shortcuts
  const handleKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === '+' || e.key === '=') zoom(0.85)
    else if (e.key === '-' || e.key === '_') zoom(1.15)
    else if (e.key === 'f' || e.key === 'F') fitView()
    else if (e.key === 'Escape') onSelectRack?.(null)
  }

  // Selected Rack details
  const selectedRackEntry = useMemo(() => {
    return rackEntries.find((r) => r.id === selectedRackId)
  }, [rackEntries, selectedRackId])

  return (
    <div
      data-pascal-2d-canvas="pure-svg"
      className={`relative flex flex-col ${isPaper ? 'bg-slate-100 border-slate-300' : 'bg-slate-900 border-slate-700/60'} border rounded-xl overflow-hidden select-none outline-none ${className}`}
      style={{ width, height, minHeight: 400 }}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      role="application"
      aria-label="Interactive 2D Warehouse Canvas"
    >
      {/* Top HUD Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/80 border-b border-slate-800 z-10 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase font-mono">
            {siteName} · 2B CAD Planı
          </span>
          {selectedRackEntry && (
            <span className="ml-2 px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-red-950/80 border border-red-700/60 text-red-300">
              Raf: {selectedRackEntry.rowLabel || '?'} (Göz {selectedRackEntry.bayIndex})
            </span>
          )}
          {selectedRowLabel && !selectedRackEntry && (
            <span className="ml-2 px-2 py-0.5 text-[11px] font-mono font-bold rounded bg-amber-950/80 border border-amber-700/60 text-amber-300">
              Sıra: {selectedRowLabel} (Tüm Koridor)
            </span>
          )}
        </div>

        {/* View Zoom & Fit Controls */}
        <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-700/80 rounded-lg p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setCanvasTheme(isPaper ? 'dark' : 'paper')}
            title={isPaper ? 'Koyu CAD Temasına Geç' : 'Açık CAD Kağıt Temasına Geç'}
            className="px-2 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-[11px] font-mono text-slate-300 hover:text-white transition-colors"
          >
            {isPaper ? 'CAD Paper' : 'Dark CAD'}
          </button>
          <div className="w-px h-4 bg-slate-700 my-auto mx-0.5" />
          <button
            type="button"
            onClick={() => zoom(0.85)}
            title="Yakınlaştır (+)"
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <Plus size={14} />
          </button>
          <button
            type="button"
            onClick={() => zoom(1.15)}
            title="Uzaklaştır (-)"
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <Minus size={14} />
          </button>
          <div className="w-px h-4 bg-slate-700 my-auto mx-0.5" />
          <button
            type="button"
            onClick={fitView}
            title="Sığdır (F)"
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Main SVG Canvas */}
      <div className="relative flex-1 w-full h-full overflow-hidden">
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{
            cursor: isPanning ? 'grabbing' : 'grab',
            touchAction: 'none',
            backgroundColor: isPaper ? '#F8FAFC' : '#0F172A',
          }}
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
          preserveAspectRatio="xMidYMid meet"
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClick={() => {
            if (!hasMovedRef.current) {
              onSelectRack?.(null)
            }
          }}
        >
          <defs>
            {/* Grid Pattern */}
            <pattern id={gridPatternId} width="2" height="2" patternUnits="userSpaceOnUse">
              <path
                d="M 2 0 L 0 0 0 2"
                fill="none"
                stroke={isPaper ? '#CBD5E1' : '#334155'}
                strokeWidth="0.04"
                strokeOpacity={isPaper ? '0.5' : '0.25'}
              />
            </pattern>

            {/* Selection Glow Filter */}
            <filter id="dt-rack-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0" stdDeviation="0.2" floodColor="#DC2626" floodOpacity="0.9" />
            </filter>
          </defs>

          {/* Background Grid */}
          <rect
            data-testid="canvas-background"
            x={viewBox.x}
            y={viewBox.y}
            width={viewBox.width}
            height={viewBox.height}
            fill={`url(#${gridPatternId})`}
            onClick={(e) => {
              if (!hasMovedRef.current) {
                e?.stopPropagation?.()
                onSelectRack?.(null)
                onSelectRow?.(null)
              }
            }}
          />

          {/* Architectural Floor Slabs Layer */}
          <g className="floorplan-slabs" pointerEvents="none">
            {slabEntries.map((s) => (
              <polygon
                key={s.id}
                data-node-id={s.id}
                data-node-type="slab"
                points={s.points}
                fill={isPaper ? '#FFFFFF' : '#1E293B'}
                stroke={isPaper ? '#CBD5E1' : '#334155'}
                strokeWidth={0.08}
                pointerEvents="none"
              />
            ))}
          </g>

          {/* Architectural Walls Layer */}
          <g className="floorplan-walls" pointerEvents="none">
            {wallEntries.map((w) => (
              <line
                key={w.id}
                data-node-id={w.id}
                data-node-type="wall"
                x1={w.x1}
                y1={w.y1}
                x2={w.x2}
                y2={w.y2}
                stroke={isPaper ? '#1E293B' : '#94A3B8'}
                strokeWidth={0.24}
                strokeLinecap="square"
                pointerEvents="none"
              />
            ))}
          </g>

          {/* Architectural Structural Columns Layer */}
          <g className="floorplan-columns" pointerEvents="none">
            {columnEntries.map((c) =>
              c.isRound ? (
                <circle
                  key={c.id}
                  data-node-id={c.id}
                  data-node-type="column"
                  cx={c.x + c.width / 2}
                  cy={c.y + c.height / 2}
                  r={c.r}
                  fill={isPaper ? '#475569' : '#64748B'}
                  stroke={isPaper ? '#0F172A' : '#CBD5E1'}
                  strokeWidth={0.02}
                  pointerEvents="none"
                />
              ) : (
                <rect
                  key={c.id}
                  data-node-id={c.id}
                  data-node-type="column"
                  x={c.x}
                  y={c.y}
                  width={c.width}
                  height={c.height}
                  fill={isPaper ? '#475569' : '#64748B'}
                  stroke={isPaper ? '#0F172A' : '#CBD5E1'}
                  strokeWidth={0.02}
                  pointerEvents="none"
                />
              ),
            )}
          </g>

          {/* Pallet Racks Layer */}
          <g className="interactive-2d-racks">
            {rackEntries.map(({ id, node, geometry }) => {
              const isSelected = id === selectedRackId
              const posX = node.position?.[0] ?? 0
              const posZ = node.position?.[2] ?? 0

              return (
                <g
                  key={id}
                  data-node-id={id}
                  data-selected={isSelected ? 'true' : 'false'}
                  className="cursor-pointer"
                  style={{ cursor: 'pointer' }}
                  pointerEvents="all"
                  filter={isSelected ? 'url(#dt-rack-glow)' : undefined}
                  onPointerDown={handlePointerDown}
                  onPointerEnter={() => onHoverRack?.(id)}
                  onPointerLeave={() => onHoverRack?.(null)}
                  onClick={(e) => {
                    if (!hasMovedRef.current) {
                      e?.stopPropagation?.()
                      onSelectRack?.(node)
                    }
                  }}
                >
                  {renderFloorplanGeometry(geometry, id)}

                  {/* Selection Pin Indicator */}
                  {isSelected && (
                    <g pointerEvents="none">
                      <circle cx={posX} cy={posZ} r={0.35} fill="#DC2626" stroke="#FFFFFF" strokeWidth={0.06} />
                      <circle cx={posX} cy={posZ} r={0.12} fill="#FFFFFF" />
                    </g>
                  )}
                </g>
              )
            })}
          </g>

          {/* Aisle Signs Layer */}
          <g className="interactive-2d-aisle-signs">
            {aisleHeaders.map(({ rowLabel, label, x, y }) => {
              const isSelected = selectedRowLabel?.toUpperCase() === rowLabel.toUpperCase()
              const signW = Math.max(1.4, label.length * 0.18 + 0.3)
              const signH = 0.42
              return (
                <g
                  key={`sign-${rowLabel}`}
                  data-aisle-sign={rowLabel}
                  className="cursor-pointer"
                  style={{ cursor: 'pointer' }}
                  pointerEvents="all"
                  onClick={(e) => {
                    if (!hasMovedRef.current) {
                      e?.stopPropagation?.()
                      onSelectRow?.(isSelected ? null : rowLabel)
                    }
                  }}
                >
                  <rect
                    x={x - signW / 2}
                    y={y - signH / 2}
                    width={signW}
                    height={signH}
                    rx={0.08}
                    ry={0.08}
                    fill={isSelected ? '#F59E0B' : '#FACC15'}
                    stroke={isSelected ? '#B45309' : '#854D0E'}
                    strokeWidth={0.03}
                  />
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={0.22}
                    fontWeight="bold"
                    fontFamily="monospace, system-ui"
                    fill="#000000"
                  >
                    {label}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>
      </div>

      {/* Footer Info HUD */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-950/90 border-t border-slate-800 text-[11px] text-slate-400 font-medium">
        <div className="flex items-center gap-4">
          <span>Toplam Raf: {rackEntries.length}</span>
          <span>Yapısal: {slabEntries.length} Zemin · {wallEntries.length} Duvar · {columnEntries.length} Kolon</span>
          {selectedRackEntry && (
            <span className="text-red-400 font-semibold font-mono">
              Seçili: SIRA {selectedRackEntry.rowLabel || '?'} · GÖZ {selectedRackEntry.bayIndex} (ID: {selectedRackEntry.id})
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-500 font-mono">
          Saf 2B Vektör CAD Planı · Anlık 3D Eşitleme
        </span>
      </div>
    </div>
  )
}
