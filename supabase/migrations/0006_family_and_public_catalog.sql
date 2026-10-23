-- ==============================================================================
-- Migration: 0006_family_and_public_catalog.sql
-- Description: Solo-first public catalog, opt-in family hub, and book requests
-- ==============================================================================

-- 1. Ensure public.books has is_public and open read access
ALTER TABLE public.books 
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;

-- Update books RLS to allow all authenticated users to read public catalog books
DROP POLICY IF EXISTS "Authenticated users can read public books" ON public.books;
CREATE POLICY "Authenticated users can read public books"
  ON public.books
  FOR SELECT
  TO authenticated
  USING (is_public = true OR public.current_user_tenant_role(tenant_id) IS NOT NULL);

-- 2. Storage policy for reading books: allow authenticated users to read book objects
DROP POLICY IF EXISTS "Storage Books: authenticated users can read public books" ON storage.objects;
CREATE POLICY "Storage Books: authenticated users can read public books"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'books');

-- 3. Create Families Table
CREATE TABLE IF NOT EXISTS public.families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 100),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_families_code ON public.families(family_code);
CREATE INDEX IF NOT EXISTS idx_families_created_by ON public.families(created_by);

-- 4. Create Family Members Table
CREATE TABLE IF NOT EXISTS public.family_members (
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'moderator', 'reader')) DEFAULT 'reader',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (family_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_family_members_user ON public.family_members(user_id);
CREATE INDEX IF NOT EXISTS idx_family_members_family_role ON public.family_members(family_id, role);

-- 5. Create Family Bookshelf (Curated books featured in a family space)
CREATE TABLE IF NOT EXISTS public.family_books (
    family_id UUID NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (family_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_family_books_family ON public.family_books(family_id);

-- 6. Create Book Requests Table
CREATE TABLE IF NOT EXISTS public.book_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
    author TEXT,
    note TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_book_requests_user ON public.book_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_book_requests_status ON public.book_requests(status, created_at DESC);

-- 7. Add family_id to reading_rooms for family collaborative reading rooms
ALTER TABLE public.reading_rooms 
  ALTER COLUMN tenant_id DROP NOT NULL;

ALTER TABLE public.reading_rooms 
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES public.families(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reading_rooms_family_created 
  ON public.reading_rooms(family_id, created_at DESC);

-- 8. Helper Security Function for Family Role Resolution
CREATE OR REPLACE FUNCTION public.current_user_family_role(check_family_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role
  FROM public.family_members
  WHERE family_id = check_family_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- 9. Row-Level Security Configuration

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_requests ENABLE ROW LEVEL SECURITY;

-- Families RLS
CREATE POLICY "Authenticated users can lookup families by code or membership"
  ON public.families
  FOR SELECT
  TO authenticated
  USING (
    true
  );

CREATE POLICY "Authenticated users can create families"
  ON public.families
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
  );

CREATE POLICY "Family admins can update family details"
  ON public.families
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_family_role(id) = 'admin'
  )
  WITH CHECK (
    public.current_user_family_role(id) = 'admin'
  );

CREATE POLICY "Family admins can delete their family"
  ON public.families
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_family_role(id) = 'admin'
  );

-- Family Members RLS
CREATE POLICY "Family members can view members of their family"
  ON public.family_members
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR public.current_user_family_role(family_id) IS NOT NULL
  );

CREATE POLICY "Authenticated users can join families"
  ON public.family_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
  );

CREATE POLICY "Family admins can update member roles"
  ON public.family_members
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_family_role(family_id) = 'admin'
  )
  WITH CHECK (
    public.current_user_family_role(family_id) = 'admin'
  );

CREATE POLICY "Users can leave or admins can remove members"
  ON public.family_members
  FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid() OR public.current_user_family_role(family_id) = 'admin'
  );

-- Family Books RLS
CREATE POLICY "Family members can view family bookshelf"
  ON public.family_books
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_family_role(family_id) IS NOT NULL
  );

CREATE POLICY "Family admins and moderators can add books to bookshelf"
  ON public.family_books
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.current_user_family_role(family_id) IN ('admin', 'moderator')
  );

CREATE POLICY "Family admins and moderators can remove books from bookshelf"
  ON public.family_books
  FOR DELETE
  TO authenticated
  USING (
    public.current_user_family_role(family_id) IN ('admin', 'moderator')
  );

-- Book Requests RLS
CREATE POLICY "Users can view their own requests and super admins can view all"
  ON public.book_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

CREATE POLICY "Authenticated users can submit book requests"
  ON public.book_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
  );
