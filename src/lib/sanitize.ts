// src/lib/sanitize.ts
// Re-export from the canonical location so legacy tests/imports still work.
export { sanitizeHtml, sanitizeStrict, stripHtml, htmlToText } from './sota/sanitize';

// Alias: sanitizeText is stripHtml (text only)
export { stripHtml as sanitizeText } from './sota/sanitize';

// Stub: clearSanitizeCache — DOMPurify doesn't need explicit cache clearing but
// the test calls this in beforeEach so we provide a no-op to satisfy it.
export function clearSanitizeCache(): void {
    // no-op: DOMPurify handles its own caching internally
}
