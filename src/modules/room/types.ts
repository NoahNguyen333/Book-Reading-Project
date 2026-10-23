import { Book } from '@/modules/library/types';

export interface RoomSessionState {
  hostUserId?: string;
  hostName?: string;
  location?: string; // EPUB CFI or "page:<n>"
  percentage?: number;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface ReadingRoom {
  id: string;
  tenantId: string;
  title: string;
  activeBookId?: string | null;
  activeBook?: Book | null;
  meetingUrl?: string | null;
  sessionState: RoomSessionState;
  createdAt?: string;
  updatedAt: string;
}

export interface RoomParticipant {
  userId: string;
  userName: string;
  email?: string;
  avatarUrl?: string;
  joinedAt: string;
  isHost?: boolean;
}

export interface CreateRoomInput {
  title: string;
  activeBookId?: string | null;
  meetingUrl?: string | null;
}

export interface UpdateRoomInput {
  title?: string;
  activeBookId?: string | null;
  meetingUrl?: string | null;
}
