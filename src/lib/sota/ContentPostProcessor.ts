// src/lib/sota/ContentPostProcessor.ts
// SOTA Content Post-Processor v4.1 — Visual Break Enforcement, FAQ Builder, HTML Polish
// Exports: ContentPostProcessor (class), enhanceHtmlDesign, injectMissingTerms, addFaqSection, postProcessContent

import type { PostProcessingResult } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

interface ProcessOptions {
  maxConsecutiveWords?: number;
  usePullQuotes?: boolean;
}

interface Violation {
  startIndex: number;
  endIndex: number;
  wordCount: number;
  textSnippet: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL BREAK ELEMENTS (injected to break up walls of text)
// ═══════════════════════════════════════════════════════════════════════════════

const BREAK_ELEMENTS = [
  `<div style="background: #ffffff; border: 1px solid #e0e7ff; border-left: 5px solid #6366f1; padding: 24px 28px; margin: 36px 0; border-radius: 0 16px 16px 0; box-shadow: 0 4px 20px rgba(99, 102, 241, 0.08); max-width: 100%; box-sizing: border-box;">
  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
    <span style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; width: 32px; height: 32px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; font-size: 16px;">💡</span>
    <strong style="color: #3730a3; font-size: 17px; font-weight: 800;">Pro Tip</strong>
  </div>
  <p style="color: #334155; font-size: 17px; margin: 0; line-height: 1.8;">Keep this principle in mind as you implement these strategies — consistency beats perfection every time.</p>
</div>`,
  `<div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-left: 4px solid #16a34a; padding: 20px 24px; border-radius: 0 12px 12px 0; margin: 36px 0; max-width: 100%; box-sizing: border-box;">
  <p style="font-weight: 700; color: #15803d; margin: 0 0 8px; font-size: 16px;">🔑 Key Insight</p>
  <p style="color: #166534; margin: 0; line-height: 1.7; font-size: 16px;">Understanding this concept is what separates beginners from experts in this field.</p>
</div>`,
  `<div style="background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border-left: 4px solid #d97706; padding: 20px 24px; border-radius: 0 12px 12px 0; margin: 36px 0; max-width: 100%; box-sizing: border-box;">
  <p style="font-weight: 700; color: #92400e; margin: 0 0 8px; font-size: 16px;">📌 Important Note</p>
  <p style="color: #78350f; margin: 0; line-height: 1.7; font-size: 16px;">Don't skip this step — it's one of the most common mistakes that leads to subpar results.</p>
</div>`,
  `<div style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border-left: 4px solid #2563eb; padding: 20px 24px; border-radius: 0 12px 12px 0; margin: 36px 0; max-width: 100%; box-sizing: border-box;">
  <p style="font-weight: 700; color: #1e40af; margin: 0 0 8px; font-size: 16px;">📋 Quick Summary</p>
  <p style="color: #1e3a5f; margin: 0; line-height: 1.7; font-size: 16px;">The bottom line? Focus on the fundamentals first, then optimize for advanced techniques once you've built a solid foundation.</p>
</div>`,
];

const PULL_QUOTES = [
  `<blockquote style="border-left: 4px solid #8b5cf6; background: linear-gradient(135deg, #faf5ff 0%, #f5f3ff 100%); margin: 36px 0; padding: 24px 28px; border-radius: 0 16px 16px 0; max-width: 100%; box-sizing: border-box;">
  <p style="font-size: 18px; font-style: italic; color: #4c1d95; line-height: 1.8; margin: 0;">"The difference between good and great often comes down to the details most people overlook."</p>
</blockquote>`,
  `<blockquote style="border-left: 4px solid #10b981; background: linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%); margin: 36px 0; padding: 24px 28px; border-radius: 0 16px 16px 0; max-width: 100%; box-sizing: border-box;">
  <p style="font-size: 18px; font-style: italic; color: #065f46; line-height: 1.8; margin: 0;">"Data doesn't lie — but it does require the right context to be useful."</p>
</blockquote>`,
];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN CLASS — Visual Break Enforcement
// ═══════════════════════════════════════════════════════════════════════════════

export class ContentPostProcessor {
  static process(html: string, options: ProcessOptions = {}): PostProcessingResult {
    const maxWords = options.maxConsecutiveWords || 200;
    const usePullQuotes = options.usePullQuotes !== false;

    if (!html || html.trim().length === 0) {
      return { html, wasModified: false, violations: [], elementsInjected: 0 };
    }

    const violations = ContentPostProcessor.findViolations(html, maxWords);

    if (violations.length === 0) {
      return { html, wasModified: false, violations: [], elementsInjected: 0 };
    }

    let result = html;
    let elementsInjected = 0;

    const breakPool = [...BREAK_ELEMENTS];
    if (usePullQuotes) breakPool.push(...PULL_QUOTES);

    const sortedViolations = [...violations].sort((a, b) => b.startIndex - a.startIndex);

    for (const violation of sortedViolations) {
      const violationHtml = result.substring(violation.startIndex, violation.endIndex);
      const paragraphs = violationHtml.match(/<\/p>/gi) || [];
      if (paragraphs.length < 2) continue;

      const midParagraphIndex = Math.floor(paragraphs.length / 2);
      let currentParagraphEnd = 0;
      let insertionPoint = -1;

      for (let i = 0; i <= midParagraphIndex; i++) {
        const nextEnd = violationHtml.indexOf('</p>', currentParagraphEnd);
        if (nextEnd !== -1) {
          currentParagraphEnd = nextEnd + 4;
          if (i === midParagraphIndex) {
            insertionPoint = violation.startIndex + currentParagraphEnd;
          }
        }
      }

      if (insertionPoint === -1) continue;

      const breakElement = breakPool[elementsInjected % breakPool.length];
      result = result.substring(0, insertionPoint) + '\n\n' + breakElement + '\n\n' + result.substring(insertionPoint);
      elementsInjected++;
    }

    return { html: result, wasModified: elementsInjected > 0, violations, elementsInjected };
  }

  static findViolations(html: string, maxWords: number): Violation[] {
    const violations: Violation[] = [];

    const breakPatterns = [
      /<div\s[^>]*style\s*=/i, /<table[\s>]/i, /<blockquote[\s>]/i,
      /<details[\s>]/i, /<figure[\s>]/i, /<ul[\s>]/i, /<ol[\s>]/i,
      /<h[1-6][\s>]/i, /<hr[\s>/]/i, /<iframe[\s>]/i, /<!-- .* -->/i,
    ];

    const pBlocks = html.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    if (pBlocks.length === 0) return violations;

    let lastIndex = 0;
    let currentRunStart = -1;
    let currentRunWords = 0;

    for (let i = 0; i < pBlocks.length; i++) {
      const block = pBlocks[i];
      const blockIndex = html.indexOf(block, lastIndex);
      if (blockIndex === -1) continue;

      if (lastIndex > 0 && blockIndex > lastIndex) {
        const between = html.substring(lastIndex, blockIndex);
        const hasBreak = breakPatterns.some(pattern => pattern.test(between));

        if (hasBreak) {
          if (currentRunWords > maxWords && currentRunStart !== -1) {
            const text = html.substring(currentRunStart, lastIndex).replace(/<[^>]*>/g, ' ').trim();
            violations.push({
              startIndex: currentRunStart, endIndex: lastIndex,
              wordCount: currentRunWords, textSnippet: text.substring(0, 80) + '...',
            });
          }
          currentRunStart = blockIndex;
          currentRunWords = 0;
        }
      }

      if (currentRunStart === -1) currentRunStart = blockIndex;

      const plainText = block.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      currentRunWords += plainText ? plainText.split(' ').filter(Boolean).length : 0;
      lastIndex = blockIndex + block.length;
    }

    if (currentRunWords > maxWords && currentRunStart !== -1) {
      const text = html.substring(currentRunStart, lastIndex).replace(/<[^>]*>/g, ' ').trim();
      violations.push({
        startIndex: currentRunStart, endIndex: lastIndex,
        wordCount: currentRunWords, textSnippet: text.substring(0, 80) + '...',
      });
    }

    return violations;
  }

  static validate(html: string, maxWords: number = 200): { valid: boolean; violations: Violation[] } {
    const violations = ContentPostProcessor.findViolations(html, maxWords);
    return { valid: violations.length === 0, violations };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STANDALONE EXPORTED FUNCTIONS (used by index.ts barrel exports)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enhance HTML with styled headings, spacing, and typography.
 * Only styles elements that don't already have inline styles.
 */
export function enhanceHtmlDesign(html: string): string {
  if (!html) return '';
  let result = html;

  // Style unstyled H2s
  result = result.replace(
    /<h2>([^<]+)<\/h2>/g,
    '<h2 style="color: #0f172a; font-size: 30px; font-weight: 900; margin: 56px 0 24px 0; padding-bottom: 14px; border-bottom: 4px solid #10b981; letter-spacing: -0.025em; line-height: 1.2;">$1</h2>'
  );

  // Style unstyled H3s
  result = result.replace(
    /<h3>([^<]+)<\/h3>/g,
    '<h3 style="color: #1e293b; font-size: 23px; font-weight: 800; margin: 40px 0 16px 0; letter-spacing: -0.02em; line-height: 1.3;">$1</h3>'
  );

  // Style unstyled H4s
  result = result.replace(
    /<h4>([^<]+)<\/h4>/g,
    '<h4 style="color: #334155; font-size: 19px; font-weight: 700; margin: 32px 0 12px 0; line-height: 1.3;">$1</h4>'
  );

  // Style unstyled paragraphs (no existing style attribute)
  result = result.replace(
    /<p(?!\s)>/g,
    '<p style="font-size: 18px; margin: 0 0 20px 0; line-height: 1.8; color: #334155;">'
  );

  // Style unstyled lists
  result = result.replace(/<ul(?!\s)>/g, '<ul style="margin: 0 0 24px 0; padding-left: 24px;">');
  result = result.replace(/<ol(?!\s)>/g, '<ol style="margin: 0 0 24px 0; padding-left: 24px;">');
  result = result.replace(/<li(?!\s)>/g, '<li style="margin: 0 0 12px 0; line-height: 1.75;">');

  // Ensure spacing between block elements
  result = result.replace(/<\/div>\s*<h2/g, '</div>\n\n<h2');
  result = result.replace(/<\/p>\s*<h2/g, '</p>\n\n<h2');

  // Remove empty paragraphs
  result = result.replace(/<p[^>]*>\s*<\/p>/g, '');

  return result;
}

/**
 * Inject missing NeuronWriter terms naturally into existing paragraphs.
 * Distributes terms across different sections of the content.
 */
export function injectMissingTerms(
  html: string,
  missingTerms: string[],
): string {
  if (!html || !missingTerms || missingTerms.length === 0) return html;

  let result = html;

  // Find all <p> blocks to inject terms into
  const paragraphs = result.match(/<p[^>]*>[^<]{50,}<\/p>/gi) || [];
  if (paragraphs.length === 0) return result;

  // Distribute terms across paragraphs evenly
  const termsToInject = missingTerms.slice(0, 30); // Cap at 30 terms
  const paragraphInterval = Math.max(1, Math.floor(paragraphs.length / termsToInject.length));

  let injected = 0;
  for (let i = 0; i < termsToInject.length && i * paragraphInterval < paragraphs.length; i++) {
    const term = termsToInject[i];
    const targetParagraphIndex = Math.min(i * paragraphInterval, paragraphs.length - 1);
    const targetParagraph = paragraphs[targetParagraphIndex];

    // Check if term is already in this paragraph
    if (targetParagraph.toLowerCase().includes(term.toLowerCase())) continue;

    // Find the closing </p> and insert the term before it
    const paragraphIndex = result.indexOf(targetParagraph);
    if (paragraphIndex === -1) continue;

    const closingPIndex = result.indexOf('</p>', paragraphIndex);
    if (closingPIndex === -1) continue;

    // Insert as an additional sentence
    const termSentence = ` This is particularly relevant when considering ${term}.`;
    result = result.substring(0, closingPIndex) + termSentence + result.substring(closingPIndex);
    injected++;
  }

  return result;
}

/**
 * Build and append a styled FAQ section from question/answer pairs.
 * Uses collapsible <details>/<summary> elements.
 */
export function addFaqSection(
  html: string,
  faqs: Array<{ question: string; answer: string }>,
): string {
  if (!html || !faqs || faqs.length === 0) return html;

  // Check if FAQ section already exists
  const hasFaq = /<(details|h2)[^>]*>[\s\S]*?(?:faq|frequently asked|common questions)/i.test(html);
  if (hasFaq) return html;

  const faqItems = faqs.map(faq => `<details style="margin: 12px 0; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; max-width: 100%; box-sizing: border-box;">
  <summary style="padding: 18px 24px; background: #f8fafc; cursor: pointer; font-weight: 700; color: #0f172a; font-size: 17px; list-style: none; display: flex; justify-content: space-between; align-items: center;">
    ${escapeHtmlStr(faq.question)} <span style="font-size: 20px; color: #64748b;">+</span>
  </summary>
  <div style="padding: 16px 24px; color: #475569; font-size: 16px; line-height: 1.8; border-top: 1px solid #e2e8f0;">
    ${faq.answer}
  </div>
</details>`).join('\n');

  const faqSection = `
<div style="margin-top: 48px;">
  <h2 style="color: #0f172a; font-size: 30px; font-weight: 900; margin: 56px 0 24px 0; padding-bottom: 14px; border-bottom: 4px solid #10b981;">❓ Frequently Asked Questions</h2>
  ${faqItems}
</div>`;

  // Insert before references section if it exists, otherwise append
  const refsMarker = html.indexOf('<!-- SOTA References Section -->');
  if (refsMarker !== -1) {
    return html.slice(0, refsMarker) + '\n\n' + faqSection + '\n\n' + html.slice(refsMarker);
  }

  return html + '\n\n' + faqSection;
}

/**
 * Comprehensive post-processing: visual breaks + HTML enhancement.
 * Convenience wrapper combining ContentPostProcessor.process() + enhanceHtmlDesign().
 */
export function postProcessContent(
  html: string,
  options?: {
    maxConsecutiveWords?: number;
    usePullQuotes?: boolean;
    enhanceDesign?: boolean;
  },
): PostProcessingResult {
  if (!html) return { html: '', wasModified: false, violations: [], elementsInjected: 0 };

  // Step 1: Enforce visual breaks
  const result = ContentPostProcessor.process(html, {
    maxConsecutiveWords: options?.maxConsecutiveWords || 200,
    usePullQuotes: options?.usePullQuotes !== false,
  });

  // Step 2: Enhance HTML design (optional, default true)
  if (options?.enhanceDesign !== false) {
    result.html = enhanceHtmlDesign(result.html);
    result.wasModified = true;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function escapeHtmlStr(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default ContentPostProcessor;
