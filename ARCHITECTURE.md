# System Architecture: Family Reading Room

## 1. Executive Architectural Overview

The **Family Reading Room** is an interactive, multi-tenant digital reading application engineered for families across distances (e.g., parents, children, grandparents). It combines an e-book reader with real-time reading rooms, synchronized page state, audio/video communication links, and role-based family libraries.

The platform is designed as a **Modular Monolith** built on **Next.js (App Router)** and **PostgreSQL (Supabase)**.

```
+-------------------------------------------------------------------------------+
|                             Next.js App Router                                |
|  +-------------------------------------------------------------------------+  |
|  |                           Presentation Layer                            |  |
|  |     (Pages, Layouts, UI Primitives, Client Hooks, Realtime Subscriptions)   |  |
|  +-------------------------------------------------------------------------+  |
|                                       |                                       |
|  +------------------------------------+------------------------------------+  |
|  |                     Modular Monolith Domain Layer                       |  |
|  |  +------------+ +------------+ +------------+ +------------+ +-------+  |  |
|  |  |    auth    | |   tenant   | |  library   | |   reader   | | room  |  |  |
|  |  +------------+ +------------+ +------------+ +------------+ +-------+  |  |
|  |         |              |              |              |           |      |  |
|  |         +--------------+--------------+--------------+-----------+      |  |
|  |                                       |                                 |  |
|  |                               v       v                                 |  |
|  |                     +-------------------+                               |  |
|  |                     |   entitlements    |                               |  |
|  |                     +-------------------+                               |  |
|  +-------------------------------------------------------------------------+  |
+-------------------------------------------------------------------------------+
                                        |
       +--------------------------------+-------------------------------+
       |                                                                |
       v                                                                v
+-------------------------------+                     +---------------------------------+
|     Supabase / PostgreSQL     |                     |        Client-Side Storage      |
|  - RLS Tenant Boundary Policy |                     |  - IndexedDB EPUB Blob Store    |
|  - 7 Core Relational Tables   |                     |  - Byte Verification & LRU Cache|
|  - Realtime Change Broadcast  |                     |  - CFI Bookmark & Sync Cache    |
+-------------------------------+                     +---------------------------------+
```

---

## 2. Modular Monolith Directory Structure

The codebase isolates domains into cohesive modules inside `src/modules/`. Each module exposes a well-defined public boundary through its `index.ts`. Direct circular dependencies between modules are disallowed; common entitlements and authorization rules reside in `src/modules/entitlements/`.

```
src/
├── app/                  # Next.js App Router (pages, layouts, route handlers)
├── components/           # Shared UI components
│   └── ui/               # Primitives (buttons, modals, inputs, badges)
├── lib/                  # Shared utilities (e.g., cn, supabase client helpers)
└── modules/              # Domain modules
    ├── auth/             # User authentication, session hydration, profile mapping
    ├── tenant/           # Family/tenant tenancy, membership lifecycle, limits
    ├── library/          # Book metadata, uploads, EPUB manifest parsing
    ├── reader/           # EPUB rendering, CFI generation, reading progress, bookmarks
    ├── room/             # Realtime reading rooms, session state sync, participant tracking
    └── entitlements/     # Pure TypeScript roles, capabilities, and permission checks
```

### Module Responsibilities & Public Contracts

1. **`auth`**:
   - Manages user sessions, OAuth providers, and Supabase Auth client bindings.
   - Converts raw auth claims into domain `AuthUser` records.

2. **`tenant`**:
   - Manages family units (tenants), membership invitations, and quota tracking.
   - Enforces tier constraints (`free` vs. upgraded plans).

3. **`library`**:
   - Coordinates file ingest, storage bucket paths, metadata extraction, and book catalog listings.

4. **`reader`**:
   - Manages Canonical Fragment Identifiers (CFI), scroll positions, reading preferences (theme, font, scale), and personal bookmarks.

5. **`room`**:
   - Controls active synchronized sessions where a host or participant reads together, broadcasting current page CFIs and meeting links.

6. **`entitlements`**:
   - Zero-dependency pure TypeScript functions that evaluate permissions.
   - Centralizes role definitions (`admin`, `reader`) and capability gates (`canUploadBooks`, `canManageRoom`, `hasTenantRole`).

---

## 3. Multi-Tenant Isolation & Row-Level Security (RLS)

All tenant data lives in a unified PostgreSQL schema with strict tenant isolation enforced at the database engine level via PostgreSQL Row-Level Security.

### Tenant Resolution & Role Enforcement

A user's membership and permissions are resolved via `public.tenant_members(tenant_id, user_id, role)`. 

The helper function `public.current_user_tenant_role(check_tenant_id UUID)` executes with `SECURITY DEFINER` semantics to prevent policy recursion, checking whether the authenticated session (`auth.uid()`) belongs to the requested tenant:

```sql
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
```

### Core Schema Overview

1. **`tenants`**: Identifies the isolated family unit with plan tier and JSONB resource limits.
2. **`tenant_members`**: Bridges users to tenants with either `'admin'` (parent/organizer) or `'reader'` (child/family member) roles.
3. **`books`**: Book catalog entries belonging to a `tenant_id`. Admins can mutate; members can view.
4. **`reading_progress`**: Tracks user-specific reading locations (`cfi`) and completion percentages within a tenant. Users can mutate only their own progress.
5. **`bookmarks`**: User-specific saved anchors within books.
6. **`reading_rooms`**: 1-to-1 relationship with `tenants`, maintaining `active_book_id` and realtime `session_state`.
7. **`audit_logs`**: Tamper-resistant log for compliance and moderation. Viewable only by tenant admins.

---

## 4. EPUB Local Blob Caching Strategy

Streaming or repeatedly downloading large EPUB files (often 5MB to 50MB) degrades user experience on metered mobile devices and family tablets. The application implements an offline-first **IndexedDB Local Blob Cache**.

### Storage Workflow

```
[Reader Component Mount]
          |
          v
   Check IndexedDB for (bookId, tenantId)
     /                           \
[Cache Hit]                  [Cache Miss]
    |                              |
Verify SHA-256 / File Size         Fetch from Supabase Storage CDN
    |                              |
Open Blob in EPUB Engine           Verify Content-Length & Checksum
                                   |
                                   Write Blob to IndexedDB
                                   |
                                   Open Blob in EPUB Engine
```

### Key Cache Principles
1. **Tenant-Isolated Keying**: Cache keys in IndexedDB are compounded: `${tenantId}:${bookId}` to prevent cross-tenant data leaks on shared family tablets.
2. **Byte Integrity Verification**: Each cached entry stores `file_size` and a SHA-256 hash matching the catalog record in `books`. If a book is re-uploaded or corrupted, the cache entry is invalidated.
3. **Eviction Policy**: Least-Recently-Used (LRU) algorithm caps total storage on mobile devices at 200MB, evicting the oldest unpinned blobs when storage thresholds are crossed.

---

## 5. Document-Normalization Pipeline

EPUB documents vary in structure, CSS formatting, and packaging. The normalization pipeline transforms raw input into an accessible, readable format:

```
[Raw EPUB / File Upload]
           |
           v
[Step 1: Security & Format Sanitization]
  - Validate MIME type (application/epub+zip)
  - Scan ZIP archive structure (container.xml, OPF package)
  - Strip external script tags (<script>) and active web components from XHTML chapters
           |
           v
[Step 2: Metadata Extraction & Manifest Parsing]
  - Extract dc:title, dc:creator, language, description, and cover image
  - Generate normalized table of contents (NCX / Nav doc)
           |
           v
[Step 3: Storage & Distribution]
  - Upload sanitized EPUB blob to Supabase Storage: `tenants/{tenant_id}/books/{book_id}.epub`
  - Write record into `public.books` with `processing_status = 'ready'`
           |
           v
[Step 4: Reader Ingestion]
  - epub.js / folio engine mounts normalized blob
  - Generate stable CFI map for exact cross-device synchronization
```

---

## 6. Realtime Room Synchronization

Family reading sessions leverage Supabase Realtime (Postgres Changes and Broadcast channels):
- **Presence Tracking**: Shows online family members currently inside the room.
- **Leader Follow Mode**: When an admin turns the page, the new CFI anchor is broadcast with an optimistic debounce window, allowing readers' screens to flip seamlessly.
- **Audio/Video Hooks**: Pluggable meeting URL field to integrate Jitsi, Daily.co, or WebRTC alongside the synchronized reader view.
