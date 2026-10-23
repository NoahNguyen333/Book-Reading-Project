-- =====================================================================
-- Session 7 Migration: Annotations, Highlights & Knowledge Hub
-- =====================================================================

-- 1. Create Annotations Table
CREATE TABLE IF NOT EXISTS public.annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    location TEXT NOT NULL,
    highlighted_text TEXT NOT NULL,
    note TEXT,
    color TEXT NOT NULL DEFAULT 'yellow' CHECK (color IN ('yellow', 'green', 'pink', 'blue')),
    is_shared BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Indexes for fast book and user filtering
CREATE INDEX IF NOT EXISTS idx_annotations_tenant_book ON public.annotations(tenant_id, book_id);
CREATE INDEX IF NOT EXISTS idx_annotations_user ON public.annotations(user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_tenant_user ON public.annotations(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS idx_annotations_created ON public.annotations(created_at DESC);

-- 3. Row Level Security (RLS)
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

-- SELECT: Users see their own private highlights + all shared highlights in their tenant space
CREATE POLICY "Users can view their own and shared tenant annotations"
ON public.annotations FOR SELECT
TO authenticated
USING (
    (user_id = auth.uid() OR is_shared = true)
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
);

-- INSERT: Authenticated space members can create annotations under their user id
CREATE POLICY "Users can create annotations in their tenant"
ON public.annotations FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
);

-- UPDATE: Users can update their own annotations
CREATE POLICY "Users can update their own annotations"
ON public.annotations FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
)
WITH CHECK (
    user_id = auth.uid()
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
);

-- DELETE: Users can delete their own annotations or tenant admins can remove them
CREATE POLICY "Users and admins can delete annotations"
ON public.annotations FOR DELETE
TO authenticated
USING (
    (user_id = auth.uid() OR public.current_user_tenant_role(tenant_id) = 'admin')
    AND public.current_user_tenant_role(tenant_id) IS NOT NULL
);
