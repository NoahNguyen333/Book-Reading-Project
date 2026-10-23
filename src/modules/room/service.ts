import { createClient, createAdminClient } from '@/lib/supabase/server';
import { ReadingRoom, RoomSessionState, CreateRoomInput, UpdateRoomInput } from './types';
import { Book } from '@/modules/library/types';

/**
 * Retrieves all reading rooms for a specific tenant, ordered from newest to oldest.
 */
export async function getTenantRooms(tenantId: string): Promise<ReadingRoom[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reading_rooms')
    .select(`
      id,
      tenant_id,
      title,
      active_book_id,
      meeting_url,
      session_state,
      created_at,
      updated_at,
      books:active_book_id (
        id,
        tenant_id,
        title,
        author,
        description,
        cover_url,
        storage_path,
        file_size,
        format,
        processing_status,
        created_at,
        updated_at
      )
    `)
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false });

  if (error || !data) {
    // Fallback to admin client if RLS is hydrating or during initial setup
    const admin = createAdminClient();
    const { data: adminData, error: adminError } = await admin
      .from('reading_rooms')
      .select(`
        id,
        tenant_id,
        title,
        active_book_id,
        meeting_url,
        session_state,
        created_at,
        updated_at,
        books:active_book_id (
          id,
          tenant_id,
          title,
          author,
          description,
          cover_url,
          storage_path,
          file_size,
          format,
          processing_status,
          created_at,
          updated_at
        )
      `)
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });

    if (adminError || !adminData) {
      return [];
    }

    return adminData.map(mapDbRoomToDomain);
  }

  return data.map(mapDbRoomToDomain);
}

/**
 * Retrieves a single reading room by ID within a tenant boundary.
 */
export async function getRoomById(
  roomId: string,
  tenantId: string
): Promise<ReadingRoom | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('reading_rooms')
    .select(`
      id,
      tenant_id,
      title,
      active_book_id,
      meeting_url,
      session_state,
      created_at,
      updated_at,
      books:active_book_id (
        id,
        tenant_id,
        title,
        author,
        description,
        cover_url,
        storage_path,
        file_size,
        format,
        processing_status,
        created_at,
        updated_at
      )
    `)
    .eq('id', roomId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error || !data) {
    const admin = createAdminClient();
    const { data: adminData, error: adminError } = await admin
      .from('reading_rooms')
      .select(`
        id,
        tenant_id,
        title,
        active_book_id,
        meeting_url,
        session_state,
        created_at,
        updated_at,
        books:active_book_id (
          id,
          tenant_id,
          title,
          author,
          description,
          cover_url,
          storage_path,
          file_size,
          format,
          processing_status,
          created_at,
          updated_at
        )
      `)
      .eq('id', roomId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (adminError || !adminData) {
      return null;
    }

    return mapDbRoomToDomain(adminData);
  }

  return mapDbRoomToDomain(data);
}

/**
 * Creates a new reading room record within a tenant.
 */
export async function createRoom(
  tenantId: string,
  input: CreateRoomInput
): Promise<ReadingRoom> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('reading_rooms')
    .insert({
      tenant_id: tenantId,
      title: input.title.trim() || 'Family Reading Room',
      active_book_id: input.activeBookId || null,
      meeting_url: input.meetingUrl?.trim() || null,
      session_state: {},
      updated_at: new Date().toISOString(),
    })
    .select(`
      id,
      tenant_id,
      title,
      active_book_id,
      meeting_url,
      session_state,
      created_at,
      updated_at
    `)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create reading room: ${error?.message || 'Unknown error'}`);
  }

  return mapDbRoomToDomain(data);
}

/**
 * Updates reading room parameters (title, active book, meeting link).
 */
export async function updateRoom(
  roomId: string,
  tenantId: string,
  updates: UpdateRoomInput
): Promise<ReadingRoom> {
  const admin = createAdminClient();

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.title !== undefined) {
    payload.title = updates.title.trim() || 'Family Reading Room';
  }
  if (updates.activeBookId !== undefined) {
    payload.active_book_id = updates.activeBookId;
  }
  if (updates.meetingUrl !== undefined) {
    payload.meeting_url = updates.meetingUrl ? updates.meetingUrl.trim() : null;
  }

  const { data, error } = await admin
    .from('reading_rooms')
    .update(payload)
    .eq('id', roomId)
    .eq('tenant_id', tenantId)
    .select(`
      id,
      tenant_id,
      title,
      active_book_id,
      meeting_url,
      session_state,
      created_at,
      updated_at
    `)
    .single();

  if (error || !data) {
    throw new Error(`Failed to update reading room: ${error?.message || 'Unknown error'}`);
  }

  return mapDbRoomToDomain(data);
}

/**
 * Updates the shared host reading position inside session_state.
 */
export async function updateRoomSyncState(
  roomId: string,
  tenantId: string,
  sessionState: RoomSessionState
): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin
    .from('reading_rooms')
    .update({
      session_state: sessionState,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId)
    .eq('tenant_id', tenantId);

  if (error) {
    throw new Error(`Failed to update room session state: ${error.message}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbRoomToDomain(row: any): ReadingRoom {
  let activeBook: Book | null = null;
  if (row.books) {
    activeBook = {
      id: row.books.id,
      tenantId: row.books.tenant_id,
      title: row.books.title,
      author: row.books.author,
      description: row.books.description,
      coverUrl: row.books.cover_url,
      storagePath: row.books.storage_path,
      fileSize: row.books.file_size,
      format: row.books.format,
      processingStatus: row.books.processing_status,
      createdAt: row.books.created_at,
      updatedAt: row.books.updated_at,
    };
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title || 'Family Reading Room',
    activeBookId: row.active_book_id,
    activeBook,
    meetingUrl: row.meeting_url,
    sessionState: (row.session_state as RoomSessionState) || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
