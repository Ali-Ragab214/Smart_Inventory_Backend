-- =============================================================================
-- Migration: Align schema with updated ERD
-- Run BEFORE starting the app, or after setting synchronize: false.
-- If starting fresh, just DROP DATABASE and let TypeORM sync recreate everything.
-- =============================================================================

-- ── 1. USERS ────────────────────────────────────────────────────────────────
-- Add new columns first, then drop old ones

-- Add 'name' column (replaces firstName + lastName)
ALTER TABLE "users" ADD COLUMN "name" varchar(255) NOT NULL DEFAULT '';

-- Backfill name from firstName + lastName
UPDATE "users" SET "name" = TRIM(COALESCE("firstName", '') || ' ' || COALESCE("lastName", ''));

-- Add password_hash column (replaces password)
ALTER TABLE "users" ADD COLUMN "password_hash" varchar(255) NOT NULL DEFAULT '';

-- Backfill password_hash from password (existing hashes are already hashed)
UPDATE "users" SET "password_hash" = "password";

-- Add warehouse_id FK column
ALTER TABLE "users" ADD COLUMN "warehouse_id" uuid NULL;

-- Drop old columns
ALTER TABLE "users" DROP COLUMN IF EXISTS "password";
ALTER TABLE "users" DROP COLUMN IF EXISTS "firstName";
ALTER TABLE "users" DROP COLUMN IF EXISTS "lastName";

-- ── 2. SKUS ─────────────────────────────────────────────────────────────────
-- Rename skuCode → sku, replace category with categoryId, remove stock fields, add preferredVendorId

-- Add 'sku' column as nullable first
ALTER TABLE "skus" ADD COLUMN "sku" varchar(100);

-- Backfill from skuCode
UPDATE "skus" SET "sku" = "skuCode";

-- Make NOT NULL + unique
ALTER TABLE "skus" ALTER COLUMN "sku" SET NOT NULL;
ALTER TABLE "skus" ADD CONSTRAINT "UQ_skus_sku" UNIQUE ("sku");

-- Add categoryId FK (nullable)
ALTER TABLE "skus" ADD COLUMN "category_id" uuid NULL;

-- Add preferredVendorId FK (nullable)
ALTER TABLE "skus" ADD COLUMN "preferred_vendor_id" uuid NULL;

-- Drop old columns that no longer exist in entity
ALTER TABLE "skus" DROP COLUMN IF EXISTS "skuCode";
ALTER TABLE "skus" DROP COLUMN IF EXISTS "category";
ALTER TABLE "skus" DROP COLUMN IF EXISTS "description";
ALTER TABLE "skus" DROP COLUMN IF EXISTS "unit";
ALTER TABLE "skus" DROP COLUMN IF EXISTS "reorderThreshold";
ALTER TABLE "skus" DROP COLUMN IF EXISTS "safetyStock";
ALTER TABLE "skus" DROP COLUMN IF EXISTS "currentQuantity";

-- ── 3. WAREHOUSES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "warehouses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "location" varchar(255),
  "status" varchar NOT NULL DEFAULT 'active',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz
);

-- ── 4. CATEGORIES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "description" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_categories_name" ON "categories" ("name");

-- ── 5. STOCK_LEVELS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "stock_levels" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sku_id" uuid NOT NULL REFERENCES "skus"("id") ON DELETE RESTRICT,
  "warehouse_id" uuid NOT NULL REFERENCES "warehouses"("id") ON DELETE RESTRICT,
  "quantity" int NOT NULL DEFAULT 0,
  "reorderThreshold" int NOT NULL DEFAULT 0,
  "safetyStock" int NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz,
  CONSTRAINT "uq_stock_levels_sku_warehouse" UNIQUE ("sku_id", "warehouse_id")
);

-- ── 6. STOCK_MOVEMENTS ─────────────────────────────────────────────────────
-- Add warehouse_id FK
ALTER TABLE "stock_movements" ADD COLUMN "warehouse_id" uuid NULL;

-- Backfill warehouse_id from a default warehouse if stock_movements has data
-- (Skip if table is empty in dev)

-- Make NOT NULL once backfilled
-- ALTER TABLE "stock_movements" ALTER COLUMN "warehouse_id" SET NOT NULL;

-- Drop old column
ALTER TABLE "stock_movements" DROP COLUMN IF EXISTS "performedByUserId";

-- ── 7. PURCHASE_ORDERS ─────────────────────────────────────────────────────
-- Add warehouse_id FK
ALTER TABLE "purchase_orders" ADD COLUMN "warehouse_id" uuid NULL;

-- ── 8. KNOWLEDGE_CHUNKS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "content" text NOT NULL,
  "embedding" text,
  "sourceType" varchar NOT NULL,
  "vendor_id" uuid,
  "sku_id" uuid,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "deletedAt" timestamptz
);

-- ── 9. INDEXES ──────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "idx_users_warehouse" ON "users" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_skus_category" ON "skus" ("category_id");
CREATE INDEX IF NOT EXISTS "idx_skus_preferred_vendor" ON "skus" ("preferred_vendor_id");
CREATE INDEX IF NOT EXISTS "idx_stock_levels_sku" ON "stock_levels" ("sku_id");
CREATE INDEX IF NOT EXISTS "idx_stock_levels_warehouse" ON "stock_levels" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_stock_movements_warehouse" ON "stock_movements" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_purchase_orders_warehouse" ON "purchase_orders" ("warehouse_id");
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_vendor" ON "knowledge_chunks" ("vendor_id");
CREATE INDEX IF NOT EXISTS "idx_knowledge_chunks_sku" ON "knowledge_chunks" ("sku_id");
