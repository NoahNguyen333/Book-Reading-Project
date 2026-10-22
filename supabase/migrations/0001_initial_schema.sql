-- ==============================================================================
-- Migration: 0001_initial_schema.sql
-- Description: Initial schema for Family Reading Room with Multi-Tenant Row-Level Security
-- ==============================================================================

-- 1. Helper Function: current_user_tenant_role
-- Evaluates the role ('admin', 'reader', or NULL) of the authenticated user within a specific tenant.
-- Uses SECURITY DEFINER to bypass RLS recursion on tenant_members during policy evaluation.
CREATE OR REPLACE FUNCTION public.current_user_tenant_role(check_tenant_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT role
  FROM public.tenant_members
  WHERE tenant_id = check_tenant_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- 2. Tenants Table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tenant Members Table
CREATE TABLE IF NOT EXISTS public.tenant_members (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reader')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_members_user_id ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_tenant_id ON public.tenant_members(tenant_id);

-- 4. Books Table
CREATE TABLE IF NOT EXISTS public.books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  description TEXT,
  cover_url TEXT,
  storage_path TEXT,
  file_size BIGINT,
  format TEXT NOT NULL DEFAULT 'epub',
  processing_status TEXT NOT NULL DEFAULT 'ready',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_books_tenant_id ON public.books(tenant_id);

-- 5. Reading Progress Table
CREATE TABLE IF NOT EXISTS public.reading_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cfi TEXT,
  percentage NUMERIC(5,2) DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_reading_progress_user_book UNIQUE (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_progress_tenant_id ON public.reading_progress(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_user_id ON public.reading_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_progress_book_id ON public.reading_progress(book_id);

-- 6. Bookmarks Table
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cfi TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_tenant_id ON public.bookmarks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON public.bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON public.bookmarks(book_id);

-- 7. Reading Rooms Table
CREATE TABLE IF NOT EXISTS public.reading_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
  active_book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
  meeting_url TEXT,
  session_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reading_rooms_tenant_id ON public.reading_rooms(tenant_id);

-- 8. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON public.audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- ==============================================================================
-- Enable Row Level Security (RLS) on all 7 tables
-- ==============================================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- RLS Policies
-- ==============================================================================

-- Tenants Table Policies
CREATE POLICY "Tenants: members can view their tenant"
  ON public.tenants
  FOR SELECT
  USING (
    public.current_user_tenant_role(id) IS NOT NULL
  );

CREATE POLICY "Tenants: admins can update tenant configuration"
  ON public.tenants
  FOR UPDATE
  USING (
    public.current_user_tenant_role(id) = 'admin'
  )
  WITH CHECK (
    public.current_user_tenant_role(id) = 'admin'
  );

-- Tenant Members Table Policies
CREATE POLICY "Tenant Members: members can view members of their tenant"
  ON public.tenant_members
  FOR SELECT
  USING (
    public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Tenant Members: admins can insert memberships"
  ON public.tenant_members
  FOR INSERT
  WITH CHECK (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

CREATE POLICY "Tenant Members: admins can update memberships"
  ON public.tenant_members
  FOR UPDATE
  USING (
    public.current_user_tenant_role(tenant_id) = 'admin'
  )
  WITH CHECK (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

CREATE POLICY "Tenant Members: admins can delete memberships"
  ON public.tenant_members
  FOR DELETE
  USING (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

-- Books Table Policies
CREATE POLICY "Books: members can view books within tenant"
  ON public.books
  FOR SELECT
  USING (
    public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Books: admins can insert books"
  ON public.books
  FOR INSERT
  WITH CHECK (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

CREATE POLICY "Books: admins can update books"
  ON public.books
  FOR UPDATE
  USING (
    public.current_user_tenant_role(tenant_id) = 'admin'
  )
  WITH CHECK (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

CREATE POLICY "Books: admins can delete books"
  ON public.books
  FOR DELETE
  USING (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

-- Reading Rooms Table Policies
CREATE POLICY "Reading Rooms: members can view reading room within tenant"
  ON public.reading_rooms
  FOR SELECT
  USING (
    public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Reading Rooms: admins can insert reading room"
  ON public.reading_rooms
  FOR INSERT
  WITH CHECK (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

CREATE POLICY "Reading Rooms: admins can update reading room"
  ON public.reading_rooms
  FOR UPDATE
  USING (
    public.current_user_tenant_role(tenant_id) = 'admin'
  )
  WITH CHECK (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

CREATE POLICY "Reading Rooms: admins can delete reading room"
  ON public.reading_rooms
  FOR DELETE
  USING (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

-- Reading Progress Table Policies
CREATE POLICY "Reading Progress: users can view only their own progress"
  ON public.reading_progress
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Reading Progress: users can insert their own progress"
  ON public.reading_progress
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Reading Progress: users can update their own progress"
  ON public.reading_progress
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Reading Progress: users can delete their own progress"
  ON public.reading_progress
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

-- Bookmarks Table Policies
CREATE POLICY "Bookmarks: users can view only their own bookmarks"
  ON public.bookmarks
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Bookmarks: users can insert their own bookmarks"
  ON public.bookmarks
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Bookmarks: users can update their own bookmarks"
  ON public.bookmarks
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  )
  WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

CREATE POLICY "Bookmarks: users can delete their own bookmarks"
  ON public.bookmarks
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
  );

-- Audit Logs Table Policies
CREATE POLICY "Audit Logs: only admins can view audit logs"
  ON public.audit_logs
  FOR SELECT
  USING (
    public.current_user_tenant_role(tenant_id) = 'admin'
  );

CREATE POLICY "Audit Logs: admins and tenant members can insert audit logs"
  ON public.audit_logs
  FOR INSERT
  WITH CHECK (
    public.current_user_tenant_role(tenant_id) IS NOT NULL
  );
