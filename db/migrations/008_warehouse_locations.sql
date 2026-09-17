-- 008_warehouse_locations.sql — Warehouse Location Master
-- Contract: MySQL 8 / MariaDB 10.11, InnoDB, utf8mb4_unicode_ci.
-- Internal BIGINT PK stays on server; CHAR(26) ULID public_id is exposed in APIs.
-- Composite UNIQUE (site_id, address_id) enforces unique location identifiers per warehouse.

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id     CHAR(26) NOT NULL UNIQUE,
  site_id       BIGINT UNSIGNED NOT NULL,
  aisle         VARCHAR(16) NOT NULL,
  bay           VARCHAR(16) NOT NULL,
  level         VARCHAR(16) NOT NULL,
  position      VARCHAR(16) NOT NULL,
  address_id    VARCHAR(64) NOT NULL,
  barcode       VARCHAR(64) NOT NULL,
  max_weight    INT UNSIGNED NOT NULL DEFAULT 1000,
  status        ENUM('Active', 'Blocked', 'Quarantine') NOT NULL DEFAULT 'Active',
  node_id       VARCHAR(64) NULL,
  slot_index    INT UNSIGNED NULL,
  x_coord       FLOAT NULL,
  y_coord       FLOAT NULL,
  z_coord       FLOAT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_site_address (site_id, address_id),
  KEY idx_loc_site (site_id),
  KEY idx_loc_barcode (barcode),
  KEY idx_loc_status (status),
  KEY idx_loc_aisle_bay (site_id, aisle, bay),
  CONSTRAINT fk_loc_site FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotent seed sample locations for warehouse 'Sakarya LM1' (Aisles A-C, Bays 01-03, Levels A-D, Positions 1-2)
INSERT INTO warehouse_locations (
  public_id, site_id, aisle, bay, level, position, address_id, barcode, max_weight, status, x_coord, y_coord, z_coord
)
SELECT
  vals.public_id, s.id, vals.aisle, vals.bay, vals.level, vals.position, vals.address_id, vals.barcode, vals.max_weight, vals.status, vals.x_coord, vals.y_coord, vals.z_coord
FROM (
  SELECT '01JM1LOC000000000000000001' AS public_id, 'A' AS aisle, '01' AS bay, 'A' AS level, '1' AS position, 'A-01-A1' AS address_id, 'LOC-A01A1' AS barcode, 1000 AS max_weight, 'Active' AS status, 12.5 AS x_coord, 0.0 AS y_coord, 5.0 AS z_coord UNION ALL
  SELECT '01JM1LOC000000000000000002', 'A', '01', 'A', '2', 'A-01-A2', 'LOC-A01A2', 1000, 'Active', 13.5, 0.0, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000003', 'A', '01', 'B', '1', 'A-01-B1', 'LOC-A01B1', 1000, 'Active', 12.5, 1.8, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000004', 'A', '01', 'B', '2', 'A-01-B2', 'LOC-A01B2', 1000, 'Active', 13.5, 1.8, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000005', 'A', '01', 'C', '1', 'A-01-C1', 'LOC-A01C1', 1000, 'Active', 12.5, 3.6, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000006', 'A', '01', 'C', '2', 'A-01-C2', 'LOC-A01C2', 1000, 'Active', 13.5, 3.6, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000007', 'A', '01', 'D', '1', 'A-01-D1', 'LOC-A01D1', 1000, 'Active', 12.5, 5.4, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000008', 'A', '01', 'D', '2', 'A-01-D2', 'LOC-A01D2', 1000, 'Active', 13.5, 5.4, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000009', 'A', '02', 'A', '1', 'A-02-A1', 'LOC-A02A1', 1200, 'Active', 15.5, 0.0, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000010', 'A', '02', 'A', '2', 'A-02-A2', 'LOC-A02A2', 1200, 'Active', 16.5, 0.0, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000011', 'A', '02', 'B', '1', 'A-02-B1', 'LOC-A02B1', 1200, 'Active', 15.5, 1.8, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000012', 'A', '02', 'B', '2', 'A-02-B2', 'LOC-A02B2', 1200, 'Active', 16.5, 1.8, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000013', 'A', '02', 'C', '1', 'A-02-C1', 'LOC-A02C1', 1200, 'Active', 15.5, 3.6, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000014', 'A', '02', 'C', '2', 'A-02-C2', 'LOC-A02C2', 1200, 'Active', 16.5, 3.6, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000015', 'A', '02', 'D', '1', 'A-02-D1', 'LOC-A02D1', 1200, 'Active', 15.5, 5.4, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000016', 'A', '02', 'D', '2', 'A-02-D2', 'LOC-A02D2', 1200, 'Active', 16.5, 5.4, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000017', 'A', '03', 'A', '1', 'A-03-A1', 'LOC-A03A1', 1000, 'Active', 18.5, 0.0, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000018', 'A', '03', 'B', '1', 'A-03-B1', 'LOC-A03B1', 1000, 'Quarantine', 18.5, 1.8, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000019', 'A', '03', 'C', '1', 'A-03-C1', 'LOC-A03C1', 1000, 'Active', 18.5, 3.6, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000020', 'A', '03', 'D', '1', 'A-03-D1', 'LOC-A03D1', 1000, 'Active', 18.5, 5.4, 5.0 UNION ALL
  SELECT '01JM1LOC000000000000000021', 'B', '01', 'A', '1', 'B-01-A1', 'LOC-B01A1', 1500, 'Blocked', 12.5, 0.0, 10.0 UNION ALL
  SELECT '01JM1LOC000000000000000022', 'B', '01', 'A', '2', 'B-01-A2', 'LOC-B01A2', 1500, 'Active', 13.5, 0.0, 10.0 UNION ALL
  SELECT '01JM1LOC000000000000000023', 'B', '01', 'B', '1', 'B-01-B1', 'LOC-B01B1', 1500, 'Active', 12.5, 1.8, 10.0 UNION ALL
  SELECT '01JM1LOC000000000000000024', 'B', '01', 'B', '2', 'B-01-B2', 'LOC-B01B2', 1500, 'Active', 13.5, 1.8, 10.0 UNION ALL
  SELECT '01JM1LOC000000000000000025', 'B', '02', 'A', '1', 'B-02-A1', 'LOC-B02A1', 1000, 'Active', 15.5, 0.0, 10.0 UNION ALL
  SELECT '01JM1LOC000000000000000026', 'B', '02', 'B', '1', 'B-02-B1', 'LOC-B02B1', 1000, 'Active', 15.5, 1.8, 10.0 UNION ALL
  SELECT '01JM1LOC000000000000000027', 'B', '02', 'C', '1', 'B-02-C1', 'LOC-B02C1', 1000, 'Active', 15.5, 3.6, 10.0 UNION ALL
  SELECT '01JM1LOC000000000000000028', 'C', '01', 'A', '1', 'C-01-A1', 'LOC-C01A1', 1000, 'Active', 12.5, 0.0, 15.0 UNION ALL
  SELECT '01JM1LOC000000000000000029', 'C', '01', 'B', '1', 'C-01-B1', 'LOC-C01B1', 1000, 'Active', 12.5, 1.8, 15.0 UNION ALL
  SELECT '01JM1LOC000000000000000030', 'C', '02', 'A', '1', 'C-02-A1', 'LOC-C02A1', 1000, 'Active', 15.5, 0.0, 15.0
) AS vals
JOIN sites s ON s.name = 'Sakarya LM1'
ON DUPLICATE KEY UPDATE address_id = values(address_id);
