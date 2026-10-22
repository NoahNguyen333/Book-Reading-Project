export interface ReadingRoom {
  id: string;
  tenantId: string;
  activeBookId?: string | null;
  meetingUrl?: string | null;
  sessionState: Record<string, unknown>;
  updatedAt: string;
}

export interface RoomParticipant {
  userId: string;
  userName: string;
  avatarUrl?: string;
  currentCfi?: string;
  isHost: boolean;
}
