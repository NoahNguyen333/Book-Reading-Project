export interface AuthUser {
  id: string;
  email?: string;
  fullName?: string;
  avatarUrl?: string;
}

export interface AuthSession {
  user: AuthUser | null;
  accessToken?: string;
}
