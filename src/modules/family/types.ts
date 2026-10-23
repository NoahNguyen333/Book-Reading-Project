import { Book } from '@/modules/library/types';

export type FamilyRole = 'admin' | 'moderator' | 'reader';

export interface Family {
  id: string;
  familyCode: string;
  name: string;
  createdBy?: string | null;
  createdAt: string;
  memberCount?: number;
}

export interface FamilyMember {
  familyId: string;
  userId: string;
  role: FamilyRole;
  joinedAt: string;
  userName?: string;
  userEmail?: string;
  avatarUrl?: string;
}

export interface FamilyBook {
  familyId: string;
  bookId: string;
  addedBy?: string | null;
  addedAt: string;
  book: Book;
}

export interface UserFamilyContext {
  family: Family;
  memberRole: FamilyRole;
  members: FamilyMember[];
}

export interface BookRequest {
  id: string;
  userId: string;
  title: string;
  author?: string | null;
  note?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  userName?: string;
  userEmail?: string;
}

export interface CreateFamilyInput {
  name: string;
}

export interface JoinFamilyInput {
  familyCode: string;
}

export interface CreateBookRequestInput {
  title: string;
  author?: string;
  note?: string;
}
