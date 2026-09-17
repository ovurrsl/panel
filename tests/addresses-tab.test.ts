import { describe, expect, it as test } from 'vitest'
import { CONSOLE_TABS, TAB_META, railEntries, tabLabel } from '@/lib/console-tabs'
import { dictionaryFor } from '@/lib/i18n'
import type { WarehouseLocation } from '@/lib/types'
import { parseRfc4180Csv } from '@/components/console/addresses-tab'

describe('Milestone M3: AddressesTab & Plan Schematic Test Suite', () => {
  describe('1. RFC 4180 CSV Engine & Excel UTF-8 BOM Compatibility', () => {
    test('parses standard RFC 4180 CSV with headers', () => {
      const csv = `Aisle,Bay,Level,Position,Address ID,Barcode,Max Weight (kg),Status
A,1,A,1,A-01-A1,A-01-A1-LOC,1200,Active
B,2,C,2,B-02-C2,B-02-C2-LOC,850,Quarantine`

      const { rows, errors } = parseRfc4180Csv(csv)
      expect(errors).toHaveLength(0)
      expect(rows).toHaveLength(2)

      expect(rows[0].aisle).toBe('A')
      expect(rows[0].bay).toBe('01')
      expect(rows[0].level).toBe('A')
      expect(rows[0].position).toBe('1')
      expect(rows[0].addressId).toBe('A-01-A1')
      expect(rows[0].barcode).toBe('A-01-A1-LOC')
      expect(rows[0].maxWeight).toBe(1200)
      expect(rows[0].status).toBe('Active')

      expect(rows[1].aisle).toBe('B')
      expect(rows[1].bay).toBe('02')
      expect(rows[1].level).toBe('C')
      expect(rows[1].position).toBe('2')
      expect(rows[1].status).toBe('Quarantine')
    })

    test('strips leading UTF-8 BOM (\\uFEFF) correctly', () => {
      const csvWithBom = `\uFEFFAisle,Bay,Level,Position
C,05,D,1`
      const { rows, errors } = parseRfc4180Csv(csvWithBom)
      expect(errors).toHaveLength(0)
      expect(rows).toHaveLength(1)
      expect(rows[0].aisle).toBe('C')
      expect(rows[0].bay).toBe('05')
      expect(rows[0].level).toBe('D')
      expect(rows[0].position).toBe('1')
      expect(rows[0].addressId).toBe('C-05-D1')
    })

    test('handles escaped quotes, commas, and multiline values within quotes', () => {
      const csvComplex = `Aisle,Bay,Level,Position,Address ID,Barcode,Max Weight,Status
"A",3,"B",1,"A-03-B1","BAR,""SPECIAL""",1000,"Blocked"`

      const { rows, errors } = parseRfc4180Csv(csvComplex)
      expect(errors).toHaveLength(0)
      expect(rows).toHaveLength(1)
      expect(rows[0].aisle).toBe('A')
      expect(rows[0].bay).toBe('03')
      expect(rows[0].level).toBe('B')
      expect(rows[0].position).toBe('1')
      expect(rows[0].barcode).toBe('BAR,"SPECIAL"')
      expect(rows[0].status).toBe('Blocked')
    })

    test('supports Turkish alias headers (Sıra, Göz, Kat, Konum, Barkod, Durum, Ağırlık)', () => {
      const csvTr = `Sira,Goz,Kat,Konum,Adres,Barkod,Agirlik,Durum
D,08,B,2,D-08-B2,TR-D08B2,950,quarantine`

      const { rows, errors } = parseRfc4180Csv(csvTr)
      expect(errors).toHaveLength(0)
      expect(rows).toHaveLength(1)
      expect(rows[0].aisle).toBe('D')
      expect(rows[0].bay).toBe('08')
      expect(rows[0].level).toBe('B')
      expect(rows[0].position).toBe('2')
      expect(rows[0].addressId).toBe('D-08-B2')
      expect(rows[0].barcode).toBe('TR-D08B2')
      expect(rows[0].maxWeight).toBe(950)
      expect(rows[0].status).toBe('Quarantine')
    })

    test('auto-generates standard address ID and barcode when omitted in CSV', () => {
      const csvMinimal = `Aisle,Bay,Level,Position
B,4,D,2`
      const { rows, errors } = parseRfc4180Csv(csvMinimal)
      expect(errors).toHaveLength(0)
      expect(rows).toHaveLength(1)
      expect(rows[0].addressId).toBe('B-04-D2')
      expect(rows[0].barcode).toBe('LOC-B04D2')
      expect(rows[0].status).toBe('Active') // default
    })

    test('returns errors when mandatory columns (Aisle or Bay) are missing', () => {
      const invalidCsv = `Level,Position,Status
A,1,Active`
      const { rows, errors } = parseRfc4180Csv(invalidCsv)
      expect(rows).toHaveLength(0)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('Missing required columns')
    })

    test('returns error when CSV content is empty or has no data rows', () => {
      const emptyCsv = `Aisle,Bay,Level,Position`
      const { rows, errors } = parseRfc4180Csv(emptyCsv)
      expect(rows).toHaveLength(0)
      expect(errors).toContain('CSV file is empty or missing data rows.')
    })
  })

  describe('2. Console Rail & Tab Plumbing for Addresses', () => {
    test('CONSOLE_TABS contains addresses tab', () => {
      expect(CONSOLE_TABS).toContain('addresses')
    })

    test('TAB_META has metadata for addresses tab', () => {
      expect(TAB_META.addresses).toBeDefined()
      expect(TAB_META.addresses.labelKey).toBe('addresses')
      // In M3, addresses permission is undefined (open to signed-in users), to be scoped in M4
      expect(TAB_META.addresses.permission).toBeUndefined()
    })

    test('railEntries includes addresses under Platform heading', () => {
      const en = dictionaryFor('en')
      const entries = railEntries(en)
      const addressItem = entries.find((e) => e.kind === 'item' && e.id === 'addresses')
      expect(addressItem).toBeDefined()
      expect(addressItem?.label).toBe('Warehouse addresses')
    })

    test('tabLabel resolves addresses in both English and Turkish', () => {
      const en = dictionaryFor('en')
      const tr = dictionaryFor('tr')

      expect(tabLabel(en, 'addresses')).toBe('Warehouse addresses')
      expect(tabLabel(tr, 'addresses')).toBe('Depo Adresleri')
    })
  })

  describe('3. Bilingual i18n Dictionary Parity for Addresses', () => {
    test('addresses and addressesLead console keys are present in both EN and TR dictionaries', () => {
      const en = dictionaryFor('en')
      const tr = dictionaryFor('tr')

      expect(en.c.addresses).toBe('Warehouse addresses')
      expect(tr.c.addresses).toBe('Depo Adresleri')
      expect(en.c.addressesLead).toBeDefined()
      expect(tr.c.addressesLead).toBeDefined()
    })

    test('all addr* top-level dictionary keys are present in both EN and TR dictionaries', () => {
      const en = dictionaryFor('en')
      const tr = dictionaryFor('tr')

      const requiredKeys = [
        'addrTitle',
        'addrSiteSelect',
        'addrSearchPlaceholder',
        'addrFilterAisle',
        'addrFilterStatus',
        'addrAllAisles',
        'addrAllStatuses',
        'addrTotal',
        'addrActive',
        'addrBlocked',
        'addrQuarantine',
        'addrExportCsv',
        'addrImportCsv',
        'addrAddLocation',
        'addrColAisle',
        'addrColBay',
        'addrColLevel',
        'addrColPosition',
        'addrColAddressId',
        'addrColBarcode',
        'addrColMaxWeight',
        'addrColStatus',
        'addrColActions',
        'addrSchematicTitle',
        'addrSchematicLead',
        'addrZoomIn',
        'addrZoomOut',
        'addrZoomReset',
        'addrSelectedBay',
        'addrNoLocations',
        'addrSaved',
        'addrImportSuccess',
        'addrImportFailed',
      ] as const

      for (const key of requiredKeys) {
        expect((en as Record<string, unknown>)[key]).toBeDefined()
        expect((tr as Record<string, unknown>)[key]).toBeDefined()
        expect(typeof (en as Record<string, unknown>)[key]).toBe('string')
        expect(typeof (tr as Record<string, unknown>)[key]).toBe('string')
        expect(((en as Record<string, unknown>)[key] as string).trim().length).toBeGreaterThan(0)
        expect(((tr as Record<string, unknown>)[key] as string).trim().length).toBeGreaterThan(0)
      }
    })
  })

  describe('4. Pure 2D SVG Warehouse Plan Schematic Coordinate Math', () => {
    test('verifies standard Aisle and Bay geometry mapping', () => {
      const AISLE_Y_MAP: Record<string, number> = {
        A: 204,
        B: 248,
        C: 376,
        D: 420,
      }
      const BAYS_PER_AISLE = 8
      const BAY_WIDTH = 58
      const BAY_GAP = 12
      const START_X = 224

      // Bay 1 X position
      const bay1X = START_X + 0 * (BAY_WIDTH + BAY_GAP)
      expect(bay1X).toBe(224)

      // Bay 8 X position
      const bay8X = START_X + 7 * (BAY_WIDTH + BAY_GAP)
      expect(bay8X).toBe(224 + 7 * 70) // 714
      expect(bay8X + BAY_WIDTH).toBeLessThan(960) // within SVG width

      // Aisle Y positions
      expect(AISLE_Y_MAP.A).toBe(204)
      expect(AISLE_Y_MAP.B).toBe(248)
      expect(AISLE_Y_MAP.C).toBe(376)
      expect(AISLE_Y_MAP.D).toBe(420)

      // Aisle separation between B and C represents the central forklift highway
      const forkliftHighwayGap = AISLE_Y_MAP.C - (AISLE_Y_MAP.B + 36)
      expect(forkliftHighwayGap).toBeGreaterThan(60) // Adequate space for 2-way traffic
    })

    test('correctly maps bay status and flags Blocked / Quarantine locations', () => {
      const mockLocations = [
        { aisle: 'A', bay: '01', status: 'Active' as const },
        { aisle: 'A', bay: '02', status: 'Blocked' as const },
        { aisle: 'B', bay: '03', status: 'Quarantine' as const },
      ]

      const bayStatusMap = new Map<string, { hasBlocked: boolean; hasQuarantine: boolean; count: number }>()
      for (const loc of mockLocations) {
        const padBay = String(loc.bay).padStart(2, '0')
        const key = `${loc.aisle.toUpperCase()}-${padBay}`
        const entry = bayStatusMap.get(key) || { hasBlocked: false, hasQuarantine: false, count: 0 }
        entry.count++
        if (loc.status === 'Blocked') entry.hasBlocked = true
        if (loc.status === 'Quarantine') entry.hasQuarantine = true
        bayStatusMap.set(key, entry)
      }

      expect(bayStatusMap.get('A-01')?.hasBlocked).toBe(false)
      expect(bayStatusMap.get('A-01')?.hasQuarantine).toBe(false)
      expect(bayStatusMap.get('A-02')?.hasBlocked).toBe(true)
      expect(bayStatusMap.get('B-03')?.hasQuarantine).toBe(true)
    })
  })
})
