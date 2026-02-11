import { describe, it, expect, beforeEach } from 'vitest';
import { sanitizeHtml, sanitizeText, clearSanitizeCache } from '../sanitize';

describe('sanitizeHtml', () => {
  beforeEach(() => clearSanitizeCache());

  it('allows standard HTML tags', () => {
    const input = '<h2>Title</h2><p>Text <strong>bold</strong></p>';
    const result = sanitizeHtml(input);
    expect(result).toContain('<h2>');
    expect(result).toContain('<strong>');
  });

  it('removes script tags', () => {
    const input = '<p>Safe</p><script>alert("xss")</script>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script');
    expect(result).not.toContain('alert');
  });

  it('removes event handlers', () => {
    const input = '<img src="x.jpg" onerror="alert(1)" />';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onerror');
  });

  it('removes javascript: URIs', () => {
    const input = '<a href="javascript:alert(1)">click</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('javascript:');
  });

  it('allows YouTube iframes', () => {
    const input = '<iframe src="https://www.youtube.com/embed/abc123"></iframe>';
    const result = sanitizeHtml(input);
    expect(result).toContain('youtube.com/embed');
  });

  it('caches repeated calls', () => {
    const input = '<p>Test</p>';
    const result1 = sanitizeHtml(input);
    const result2 = sanitizeHtml(input);
    expect(result1).toBe(result2);
  });
});

describe('sanitizeText', () => {
  it('strips all HTML tags', () => {
    const input = '<h2>Title</h2><p>Text with <strong>bold</strong></p>';
    const result = sanitizeText(input);
    expect(result).toBe('TitleText with bold');
  });
});
