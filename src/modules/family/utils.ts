import { FamilyRole } from './types';

// Unambiguous character set omitting 0, O, 1, I to avoid human transcription mistakes
const CODE_CHARACTERS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * Generates an elegant, human-friendly family code (e.g. FAM-7K9P).
 */
export function generateFamilyCode(length: number = 4): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * CODE_CHARACTERS.length);
    code += CODE_CHARACTERS[randomIndex];
  }
  return `FAM-${code}`;
}

/**
 * Normalizes input family code:
 * - Trims whitespace
 * - Converts to uppercase
 * - Automatically prepends 'FAM-' if the user typed just the suffix (e.g., '7K9P' -> 'FAM-7K9P')
 */
export function normalizeFamilyCode(raw?: string | null): string {
  if (!raw) return '';
  let cleaned = raw.trim().toUpperCase();
  if (!cleaned.startsWith('FAM-') && !cleaned.startsWith('FAM_')) {
    cleaned = `FAM-${cleaned}`;
  } else if (cleaned.startsWith('FAM_')) {
    cleaned = `FAM-${cleaned.slice(4)}`;
  }
  return cleaned;
}

/**
 * Validates whether a string matches standard family code formatting (FAM-XXXX).
 */
export function isValidFamilyCode(raw?: string | null): boolean {
  if (!raw) return false;
  const normalized = normalizeFamilyCode(raw);
  const regex = /^FAM-[2-9A-HJ-NP-Z]{4,8}$/;
  return regex.test(normalized);
}

/**
 * Formats family role display label:
 * - 'admin' -> "[Family Name] Admin" or "Admin"
 * - 'moderator' -> "[Family Name] Nhóm phó (Moderator)" or "Nhóm phó (Moderator)"
 * - 'reader' -> "[Family Name] Độc giả (Reader)" or "Độc giả (Reader)"
 * - no role -> "Chưa tham gia gia đình"
 */
export function formatFamilyRoleDisplay(
  role?: FamilyRole | null,
  familyName?: string | null
): string {
  if (!role) {
    return 'Chưa tham gia gia đình';
  }

  const prefix = familyName ? `${familyName.trim()} ` : '';
  switch (role) {
    case 'admin':
      return `${prefix}Admin`;
    case 'moderator':
      return `${prefix}Nhóm phó (Moderator)`;
    case 'reader':
    default:
      return `${prefix}Độc giả (Reader)`;
  }
}

/**
 * Determines whether a family role has authority to curate the Family Bookshelf.
 * Both Family Admins and Family Moderators have bookshelf curation rights.
 */
export function canManageFamilyBooks(role?: FamilyRole | null): boolean {
  return role === 'admin' || role === 'moderator';
}

/**
 * Determines whether a family role has authority to assign roles or remove members.
 * Only the Family Admin has member governance privileges.
 */
export function canManageFamilyMembers(role?: FamilyRole | null): boolean {
  return role === 'admin';
}
