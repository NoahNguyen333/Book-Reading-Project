-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. CREATE ALL TABLES FIRST
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    plan_tier TEXT NOT NULL DEFAULT 'free',
    limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.tenant_members (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'reader')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (tenant_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    description TEXT,
    cover_url TEXT,
    storage_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    format TEXT NOT NULL DEFAULT 'epub',
    processing_status TEXT NOT NULL DEFAULT 'ready',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.reading_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cfi TEXT NOT NULL,
    percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(user_id, book_id)
);

CREATE TABLE IF NOT EXISTS public.bookmarks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cfi TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.reading_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE UNIQUE,
    active_book_id UUID REFERENCES public.books(id) ON DELETE SET NULL,
    meeting_url TEXT,
    session_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. INDEXES
CREATE INDEX IF NOT EXISTS idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX IF NOT EXISTS idx_books_tenant ON public.books(tenant_id);
CREATE INDEX IF NOT EXISTS idx_progress_user_book ON public.reading_progress(user_id, book_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_book ON public.bookmarks(user_id, book_id);

-- 4. HELPER FUNCTION (NOW SAFE TO REFERENCE public.tenant_members)
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

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. POLICIES
-- Tenants
CREATE POLICY "Users can view tenants they belong to"
ON public.tenants FOR SELECT
TO authenticated
USING (
  id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

-- Tenant Members
CREATE POLICY "Members can view members in the same tenant"
ON public.tenant_members FOR SELECT
TO authenticated
USING (
  tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid())
);

CREATE POLICY "Admins can manage tenant members"
ON public.tenant_members FOR ALL
TO authenticated
USING (
  public.current_user_tenant_role(tenant_id) = 'admin'
)
WITH CHECK (
  public.current_user_tenant_role(tenant_id) = 'admin'
);

-- Books
CREATE POLICY "Tenant members can view books"
ON public.books FOR SELECT
TO authenticated
USING (
  public.current_user_tenant_role(tenant_id) IS NOT NULL
);

CREATE POLICY "Admins can insert books"
ON public.books FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_tenant_role(tenant_id) = 'admin'
);

CREATE POLICY "Admins can update books"
ON public.books FOR UPDATE
TO authenticated
USING (
  public.current_user_tenant_role(tenant_id) = 'admin'
)
WITH CHECK (
  public.current_user_tenant_role(tenant_id) = 'admin'
);

CREATE POLICY "Admins can delete books"
ON public.books FOR DELETE
TO authenticated
USING (
  public.current_user_tenant_role(tenant_id) = 'admin'
);

-- Reading Progress
CREATE POLICY "Users manage their own reading progress"
ON public.reading_progress FOR ALL
TO authenticated
USING (
  user_id = auth.uid() AND public.current_user_tenant_role(tenant_id) IS NOT NULL
)
WITH CHECK (
  user_id = auth.uid() AND public.current_user_tenant_role(tenant_id) IS NOT NULL
);

-- Bookmarks
CREATE POLICY "Users manage their own bookmarks"
ON public.bookmarks FOR ALL
TO authenticated
USING (
  user_id = auth.uid() AND public.current_user_tenant_role(tenant_id) IS NOT NULL
)
WITH CHECK (
  user_id = auth.uid() AND public.current_user_tenant_role(tenant_id) IS NOT NULL
);

-- Reading Rooms
CREATE POLICY "Tenant members can view reading room"
ON public.reading_rooms FOR SELECT
TO authenticated
USING (
  public.current_user_tenant_role(tenant_id) IS NOT NULL
);

CREATE POLICY "Admins can update reading room"
ON public.reading_rooms FOR ALL
TO authenticated
USING (
  public.current_user_tenant_role(tenant_id) = 'admin'
)
WITH CHECK (
  public.current_user_tenant_role(tenant_id) = 'admin'
);

-- Audit Logs
CREATE POLICY "Admins can view tenant audit logs"
ON public.audit_logs FOR SELECT
TO authenticated
USING (
  public.current_user_tenant_role(tenant_id) = 'admin'
);

CREATE POLICY "Members can insert audit logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (
  public.current_user_tenant_role(tenant_id) IS NOT NULL
);