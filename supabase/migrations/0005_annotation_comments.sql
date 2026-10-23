-- ==============================================================================
-- Migration: 0005_annotation_comments.sql
-- Description: Discussion threads & nested replies for family reading annotations
-- ==============================================================================

-- 1. Create public.annotation_comments table
CREATE TABLE IF NOT EXISTS public.annotation_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    annotation_id UUID NOT NULL REFERENCES public.annotations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Performance indexes for discussion retrieval and tenant filtering
CREATE INDEX IF NOT EXISTS idx_annotation_comments_annotation_id 
    ON public.annotation_comments (annotation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_annotation_comments_tenant_id 
    ON public.annotation_comments (tenant_id);

CREATE INDEX IF NOT EXISTS idx_annotation_comments_user_id 
    ON public.annotation_comments (user_id);

-- 3. Enable Row-Level Security
ALTER TABLE public.annotation_comments ENABLE ROW LEVEL SECURITY;

-- 4. Row-Level Security Policies

-- Policy 1: SELECT - Members can read comments on annotations belonging to their tenant
-- (If the parent annotation is accessible to the user, either private by them or shared in the tenant)
CREATE POLICY "Members can read comments on accessible annotations"
    ON public.annotation_comments
    FOR SELECT
    TO authenticated
    USING (
        public.current_user_tenant_role(tenant_id) IS NOT NULL
        AND
        EXISTS (
            SELECT 1 FROM public.annotations a
            WHERE a.id = annotation_comments.annotation_id
              AND a.tenant_id = annotation_comments.tenant_id
              AND (a.user_id = auth.uid() OR a.is_shared = true)
        )
    );

-- Policy 2: INSERT - Space members can add comments to accessible annotations
CREATE POLICY "Members can add comments to accessible annotations"
    ON public.annotation_comments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        user_id = auth.uid()
        AND public.current_user_tenant_role(tenant_id) IS NOT NULL
        AND
        EXISTS (
            SELECT 1 FROM public.annotations a
            WHERE a.id = annotation_comments.annotation_id
              AND a.tenant_id = annotation_comments.tenant_id
              AND (a.user_id = auth.uid() OR a.is_shared = true)
        )
    );

-- Policy 3: UPDATE - Only comment authors can edit their comment
CREATE POLICY "Authors can update their own comments"
    ON public.annotation_comments
    FOR UPDATE
    TO authenticated
    USING (
        user_id = auth.uid()
        AND public.current_user_tenant_role(tenant_id) IS NOT NULL
    )
    WITH CHECK (
        user_id = auth.uid()
        AND public.current_user_tenant_role(tenant_id) IS NOT NULL
    );

-- Policy 4: DELETE - Comment authors or tenant admins can delete comments
CREATE POLICY "Authors or space admins can delete comments"
    ON public.annotation_comments
    FOR DELETE
    TO authenticated
    USING (
        user_id = auth.uid()
        OR public.current_user_tenant_role(tenant_id) = 'admin'
    );
