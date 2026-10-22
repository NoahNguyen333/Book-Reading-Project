-- ==============================================================================
-- Migration: 0002_storage_setup.sql
-- Description: Provision private Supabase Storage bucket for EPUB books with
--              tenant-scoped Row-Level Security policies.
-- ==============================================================================

-- 1. Create Private Storage Bucket for Books
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'books',
  'books',
  false,
  52428800, -- 50 MB
  ARRAY['application/epub+zip', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['application/epub+zip', 'image/jpeg', 'image/png', 'image/webp'];

-- 2. Storage Objects Row-Level Security Policies
-- Path convention: {tenant_id}/{filename}

-- Policy: Members can view and download books within their tenant space
CREATE POLICY "Storage Books: tenant members can read objects"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'books'
  AND (
    -- Safely extract tenant_id from the first path segment
    CASE 
      WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      THEN public.current_user_tenant_role(split_part(name, '/', 1)::uuid) IS NOT NULL
      ELSE false
    END
  )
);

-- Policy: Only tenant admins can upload objects into their tenant folder
CREATE POLICY "Storage Books: tenant admins can upload objects"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'books'
  AND (
    CASE 
      WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      THEN public.current_user_tenant_role(split_part(name, '/', 1)::uuid) = 'admin'
      ELSE false
    END
  )
);

-- Policy: Only tenant admins can update objects in their tenant folder
CREATE POLICY "Storage Books: tenant admins can update objects"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'books'
  AND (
    CASE 
      WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      THEN public.current_user_tenant_role(split_part(name, '/', 1)::uuid) = 'admin'
      ELSE false
    END
  )
)
WITH CHECK (
  bucket_id = 'books'
  AND (
    CASE 
      WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      THEN public.current_user_tenant_role(split_part(name, '/', 1)::uuid) = 'admin'
      ELSE false
    END
  )
);

-- Policy: Only tenant admins can delete objects in their tenant folder
CREATE POLICY "Storage Books: tenant admins can delete objects"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'books'
  AND (
    CASE 
      WHEN name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/'
      THEN public.current_user_tenant_role(split_part(name, '/', 1)::uuid) = 'admin'
      ELSE false
    END
  )
);
