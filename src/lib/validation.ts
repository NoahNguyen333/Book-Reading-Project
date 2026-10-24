/**
 * Shared validation utilities for input sanitation, invariant enforcement, and boundary checks.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates standard UUIDv4 / UUID strings.
 */
export function isValidUuid(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id.trim());
}

/**
 * Validates and clamps a string within specified length bounds.
 */
export function sanitizeText(
  value: unknown,
  options?: { min?: number; max?: number; required?: boolean }
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const str = String(value).trim();
  if (options?.required && str.length === 0) {
    return null;
  }
  if (str.length === 0 && !options?.required) {
    return null;
  }
  if (options?.min !== undefined && str.length < options.min) {
    return null;
  }
  if (options?.max !== undefined && str.length > options.max) {
    return null;
  }
  return str;
}

/**
 * Validates HTTP/HTTPS URLs. In non-local environments, strictly requires HTTPS.
 */
export function isValidMeetingUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === 'https:') {
      return true;
    }
    if (parsed.protocol === 'http:') {
      return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    }
    return false;
  } catch {
    return false;
  }
}
