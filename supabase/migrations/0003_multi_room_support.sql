-- ==============================================================================
-- Migration: 0003_multi_room_support.sql
-- Description: Expand reading_rooms to support 1:N rooms per tenant, custom titles,
--              and created_at timestamps.
-- ==============================================================================

-- 1. Remove unique constraint on tenant_id to allow 1:N reading rooms per tenant
ALTER TABLE public.reading_rooms DROP CONSTRAINT IF EXISTS reading_rooms_tenant_id_key;

-- 2. Add title and created_at columns if not present
ALTER TABLE public.reading_rooms 
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Main Family Room',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 3. Create index on (tenant_id, created_at) for efficient multi-room listing
CREATE INDEX IF NOT EXISTS idx_reading_rooms_tenant_created 
  ON public.reading_rooms(tenant_id, created_at DESC);
