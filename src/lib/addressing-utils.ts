/**
 * Pure, zero-dependency warehouse location addressing and barcode utility functions.
 * Safe for both React client components and Node.js server environments.
 */

export const LEVEL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'] as const

export function levelToLetter(levelIndex: number): string {
  return LEVEL_LETTERS[levelIndex] ?? String.fromCharCode(65 + Math.max(0, levelIndex))
}

export function letterToLevel(letter: string): number {
  if (!letter) return 0
  const upper = letter.toUpperCase().trim()
  const idx = LEVEL_LETTERS.indexOf(upper as any)
  if (idx !== -1) return idx
  const code = upper.charCodeAt(0) - 65
  return code >= 0 && code < 26 ? code : 0
}

export interface FormatAddressOptions {
  aisle: string
  bay: number | string
  level: number | string
  position: number | string
  depth?: number
}

/**
 * Formats an industrial slot address conforming to the enterprise standard:
 * `${aisle}-${padBay}-${levelChar}${position}` (with optional `-${depth}` suffix).
 * Supports both options object and positional arguments.
 */
export function formatIndustrialAddress(
  aisleOrOptions: string | FormatAddressOptions,
  bayArg?: number | string,
  levelArg?: number | string,
  positionArg?: number | string,
  depthArg?: number
): string {
  let aisle: string
  let bay: number | string
  let level: number | string
  let position: number | string
  let depth: number | undefined

  if (typeof aisleOrOptions === 'object' && aisleOrOptions !== null) {
    aisle = aisleOrOptions.aisle
    bay = aisleOrOptions.bay
    level = aisleOrOptions.level
    position = aisleOrOptions.position
    depth = aisleOrOptions.depth
  } else {
    aisle = String(aisleOrOptions)
    bay = bayArg!
    level = levelArg!
    position = positionArg!
    depth = depthArg
  }

  const cleanAisle = (aisle || 'A').trim()
  const padBay = String(parseInt(String(bay), 10) || 1).padStart(2, '0')

  let levelChar = 'A'
  if (typeof level === 'number') {
    levelChar = levelToLetter(level)
  } else if (typeof level === 'string') {
    const trimmed = level.trim().toUpperCase()
    if (trimmed.length === 1 && trimmed >= 'A' && trimmed <= 'Z') {
      levelChar = trimmed
    } else {
      const parsed = parseInt(trimmed, 10)
      levelChar = Number.isNaN(parsed) ? (trimmed[0] ?? 'A') : levelToLetter(parsed)
    }
  }

  const posStr = String(position || '1').trim()
  const depthSuffix = depth && depth > 1 ? `-${depth}` : ''
  return `${cleanAisle}-${padBay}-${levelChar}${posStr}${depthSuffix}`
}

/**
 * Synthesizes a barcode identifier from an address ID.
 * Standard format: `LOC-${addressId.replace(/[^A-Za-z0-9]/g, '')}`
 */
export function generateBarcode(addressId: string): string {
  return `LOC-${(addressId || '').replace(/[^A-Za-z0-9]/g, '')}`
}
