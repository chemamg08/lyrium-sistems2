/**
 * Sanitize a user-provided filename to prevent path traversal and other attacks.
 */
export function sanitizeFilename(name: string): string {
  let safe = name;
  // Remove path separators, null bytes, and traversal patterns
  safe = safe.replace(/[/\\:\0]/g, '_');
  safe = safe.replace(/\.\./g, '_');
  // Remove characters unsafe on Windows/Unix filesystems
  safe = safe.replace(/[<>"|?*]/g, '_');
  // Trim leading/trailing dots and whitespace
  safe = safe.replace(/^[\s.]+|[\s.]+$/g, '');
  // Limit length (keep extension)
  if (safe.length > 200) {
    const ext = safe.lastIndexOf('.') > safe.length - 20 ? safe.substring(safe.lastIndexOf('.')) : '';
    safe = safe.substring(0, 200 - ext.length) + ext;
  }
  return safe || 'unnamed';
}
