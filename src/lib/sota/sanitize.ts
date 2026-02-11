// src/lib/sanitize.ts
import DOMPurify from 'dompurify';

/**
 * Enterprise-grade HTML sanitization using DOMPurify.
 * Allows safe content, blocks XSS vectors, and supports WP-style markup.
 */

// Allowlist YouTube/Vimeo iframes only on the client
if (typeof window !== 'undefined') {
  DOMPurify.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'iframe') {
      const src = node.getAttribute('src') || '';
      const allowedDomains = [
        'youtube.com/embed',
        'youtube-nocookie.com/embed',
        'player.vimeo.com',
        'www.youtube.com/embed',
      ];
      const isAllowed = allowedDomains.some(domain => src.includes(domain));
      if (!isAllowed) {
        node.parentNode?.removeChild(node);
      }
    }
  });
}

const SANITIZE_CONFIG: DOMPurify.Config = {
  ALLOWED_TAGS: [
    // Block elements
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'div', 'section', 'article', 'aside', 'header', 'footer', 'nav', 'main',
    'blockquote', 'pre', 'code', 'hr', 'br',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    // Inline
    'a', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup',
    'span', 'mark', 'abbr', 'cite', 'q', 'time',
    // Media
    'img', 'figure', 'figcaption', 'picture', 'source',
    'video', 'audio', 'iframe',
    // Misc
    'details', 'summary',
  ],
  ALLOWED_ATTR: [
    'href', 'src', 'alt', 'title', 'style', 'class', 'id', 'name',
    'target', 'rel', 'width', 'height',
    'colspan', 'rowspan', 'scope', 'headers',
    'loading', 'decoding', 'fetchpriority',
    'allow', 'allowfullscreen', 'frameborder',
    'datetime', 'open', 'cite',
    'start', 'reversed', 'type', 'value',
    'data-*',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ['script', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button'],
  FORBID_ATTR: ['onerror', 'onclick', 'onload', 'onmouseover', 'onfocus', 'onblur'],
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'target'],
  KEEP_CONTENT: true,
};

// LRU Cache for repeated sanitization calls
const sanitizeCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 20;

export function sanitizeHtml(html: string): string {
  if (!html) return '';

  const cached = sanitizeCache.get(html);
  if (cached !== undefined) return cached;

  const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG);

  if (sanitizeCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = sanitizeCache.keys().next().value;
    if (firstKey) sanitizeCache.delete(firstKey);
  }
  sanitizeCache.set(html, clean);

  return clean;
}

/**
 * Sanitize to plain text (strips all HTML).
 */
export function sanitizeText(html: string): string {
  if (!html) return '';
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

/**
 * Clear sanitization cache (use when bulk-updating content).
 */
export function clearSanitizeCache(): void {
  sanitizeCache.clear();
}
