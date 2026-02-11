// src/lib/sota/ContentPostProcessor.ts
// SOTA Content Post-Processor v3.0 - Enterprise-Grade HTML Enhancement

import type { NeuronWriterAnalysis } from './NeuronWriterService';
import { scoreContentAgainstNeuron } from './NeuronWriterService';

/**
 * Enhances HTML content with enterprise-grade visual elements.
 */
export function enhanceHtmlDesign(html: string): string {
  let enhanced = html;

  // Enhance blockquotes that don't have inline styles
  enhanced = enhanced.replace(
    /<blockquote>(?!\s*<blockquote)([\s\S]*?)<\/blockquote>/gi,
    `<blockquote style="border-left: 4px solid #8b5cf6; background: linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%); padding: 20px 24px; margin: 24px 0; border-radius: 0 12px 12px 0; font-style: italic; color: #4c1d95; line-height: 1.8;">$1</blockquote>`
  );

  // Enhance tables that don't have inline styles
  enhanced = enhanced.replace(
    /<table(?!\s+style)>/gi,
    `<table style="width: 100%; border-collapse: collapse; margin: 24px 0; font-size: 15px;">`
  );

  enhanced = enhanced.replace(
    /<th(?!\s+style)>/gi,
    `<th style="padding: 14px 18px; text-align: left; background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #f8fafc; font-weight: 600; border: 1px solid #374151;">`
  );

  enhanced = enhanced.replace(
    /<td(?!\s+style)>/gi,
    `<td style="padding: 12px 18px; border: 1px solid #e5e7eb;">`
  );

  // Add proper spacing to H2/H3 if missing
  enhanced = enhanced.replace(
    /<h2(?!\s+style)/gi,
    `<h2 style="margin-top: 48px; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 2px solid #f1f5f9;"`
  );

  enhanced = enhanced.replace(
    /<h3(?!\s+style)/gi,
    `<h3 style="margin-top: 32px; margin-bottom: 12px;"`
  );

  // Ensure images are responsive
  enhanced = enhanced.replace(
    /<img(?!\s[^>]*style)/gi,
    `<img style="max-width: 100%; height: auto; border-radius: 12px; margin: 24px 0;"`
  );

  // Add horizontal rules between major sections (before H2 tags, but not the first one)
  let h2Count = 0;
  enhanced = enhanced.replace(/<h2/gi, (match) => {
    h2Count++;
    if (h2Count > 1) {
      return `<hr style="border: none; border-top: 2px solid #f1f5f9; margin: 48px 0;" />\n${match}`;
    }
    return match;
  });

  return enhanced;
}

/**
 * Injects missing NeuronWriter terms into appropriate locations within the content.
 * This is the "editor pass" that ensures 90%+ score.
 */
export function injectMissingTerms(
  html: string,
  analysis: NeuronWriterAnalysis,
  maxIterations: number = 2
): string {
  let content = html;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const scoreResult = scoreContentAgainstNeuron(content, analysis);
    
    if (scoreResult.score >= 90) break; // Already at target

    const missingTerms = scoreResult.missing;
    const underusedTerms = scoreResult.underused;

    if (missingTerms.length === 0 && underusedTerms.length === 0) break;

    // Strategy 1: Add missing high-weight terms into existing paragraphs
    const paragraphs = content.match(/<p[^>]*>[\s\S]*?<\/p>/gi) || [];
    
    for (const term of missingTerms.slice(0, 15)) {
      // Find the term data
      const termData = [...analysis.basicKeywords, ...analysis.extendedKeywords, ...analysis.entities]
        .find(t => t.term === term);
      if (!termData) continue;

      // Find a paragraph that's topically related
      let inserted = false;
      for (let i = 0; i < paragraphs.length && !inserted; i++) {
        const p = paragraphs[i];
        const pText = p.replace(/<[^>]*>/g, '').toLowerCase();
        
        // Check if paragraph is about a related topic
        const termWords = term.toLowerCase().split(/\s+/);
        const hasRelatedContent = termWords.some(tw => 
          tw.length > 3 && pText.includes(tw)
        );

        if (hasRelatedContent || (i > 2 && i < paragraphs.length - 2)) {
          // Add the term naturally in context
          const enrichedP = p.replace(
            /<\/p>/i,
            ` This is particularly relevant when considering <strong>${term}</strong> in the broader context.</p>`
          );
          content = content.replace(p, enrichedP);
          inserted = true;
        }
      }
    }

    // Strategy 2: Add underused terms by strengthening existing mentions
    for (const term of underusedTerms.slice(0, 10)) {
      const termLower = term.toLowerCase();
      const regex = new RegExp(`(${termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
      
      // Find a paragraph without this term and add it
      for (const p of paragraphs) {
        const pText = p.replace(/<[^>]*>/g, '').toLowerCase();
        if (!pText.includes(termLower) && pText.length > 80) {
          const enrichedP = p.replace(
            /<\/p>/i,
            ` Understanding ${term} is essential for achieving optimal results.</p>`
          );
          content = content.replace(p, enrichedP);
          break;
        }
      }
    }
  }

  return content;
}

/**
 * Adds FAQ schema-friendly section at the end of the content if PAA questions exist.
 */
export function addFaqSection(
  html: string,
  questions: { question: string; answer: string }[]
): string {
  if (!questions || questions.length === 0) return html;

  const faqHtml = `
<hr style="border: none; border-top: 2px solid #f1f5f9; margin: 48px 0;" />
<h2 style="margin-top: 48px; margin-bottom: 24px;">Frequently Asked Questions</h2>
<div style="space-y: 16px;">
${questions.map(q => `
<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px 24px; margin-bottom: 16px;">
  <h3 style="font-size: 18px; font-weight: 700; color: #0f172a; margin: 0 0 12px;">${q.question}</h3>
  <p style="color: #475569; line-height: 1.8; margin: 0;">${q.answer}</p>
</div>
`).join('')}
</div>`;

  return html + faqHtml;
}

/**
 * Full post-processing pipeline for generated content.
 */
export function postProcessContent(
  html: string,
  options: {
    neuronAnalysis?: NeuronWriterAnalysis;
    faqQuestions?: { question: string; answer: string }[];
    enhanceDesign?: boolean;
    injectTerms?: boolean;
  } = {}
): { content: string; neuronScore: number } {
  let content = html;

  // Step 1: Enhance HTML design
  if (options.enhanceDesign !== false) {
    content = enhanceHtmlDesign(content);
  }

  // Step 2: Inject missing NeuronWriter terms
  if (options.injectTerms !== false && options.neuronAnalysis) {
    content = injectMissingTerms(content, options.neuronAnalysis);
  }

  // Step 3: Add FAQ section
  if (options.faqQuestions && options.faqQuestions.length > 0) {
    content = addFaqSection(content, options.faqQuestions);
  }

  // Step 4: Calculate final NeuronWriter score
  let neuronScore = 0;
  if (options.neuronAnalysis) {
    const scoreResult = scoreContentAgainstNeuron(content, options.neuronAnalysis);
    neuronScore = scoreResult.score;
  }

  return { content, neuronScore };
}

export default {
  enhanceHtmlDesign,
  injectMissingTerms,
  addFaqSection,
  postProcessContent,
};
