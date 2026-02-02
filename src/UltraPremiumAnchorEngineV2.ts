// =============================================================================
// ULTRA PREMIUM ANCHOR ENGINE V2.1 - STRICT VALIDATION
// =============================================================================

import { escapeRegExp } from './contentUtils';

export interface SemanticEntity {
  text: string;
  type: 'topic' | 'concept' | 'action' | 'modifier' | 'brand';
  confidence: number;
  synonyms: string[];
  relatedConcepts: string[];
}

export interface ContextWindow {
  before: string;
  target: string;
  after: string;
  sentenceContext: string;
  paragraphTheme: string;
  documentTopics: string[];
}

export interface UltraAnchorCandidate {
  text: string;
  normalizedText: string;
  qualityScore: number;
  semanticScore: number;
  contextualFit: number;
  readabilityScore: number;
  seoValue: number;
  naturalness: number;
  wordCount: number;
  position: 'early' | 'middle' | 'late';
  sentenceRole: 'subject' | 'object' | 'complement' | 'modifier';
  entities: SemanticEntity[];
  contextWindow: ContextWindow;
}

export interface UltraAnchorConfig {
  minWords: number;
  maxWords: number;
  idealWordRange: [number, number];
  minQualityScore: number;
  semanticWeight: number;
  contextWeight: number;
  naturalWeight: number;
  seoWeight: number;
  avoidGenericAnchors: boolean;
  enforceDescriptive: boolean;
  requireTopicRelevance: boolean;
  sentencePositionBias: 'middle' | 'end' | 'natural';
  maxOverlapWithHeading: number;
}

export interface PageContext {
  title: string;
  slug: string;
  description?: string;
  primaryKeyword?: string;
  secondaryKeywords?: string[];
  category?: string;
  topics?: string[];
  entities?: SemanticEntity[];
}

export interface AnchorInjectionResult {
  success: boolean;
  anchor: string;
  targetUrl: string;
  qualityMetrics: {
    overall: number;
    semantic: number;
    contextual: number;
    natural: number;
    seo: number;
  };
  position: number;
  reasoning: string;
}

export const ULTRA_CONFIG: UltraAnchorConfig = {
  minWords: 4,
  maxWords: 7,
  idealWordRange: [4, 6],
  minQualityScore: 75,
  semanticWeight: 0.30,
  contextWeight: 0.25,
  naturalWeight: 0.25,
  seoWeight: 0.20,
  avoidGenericAnchors: true,
  enforceDescriptive: true,
  requireTopicRelevance: true,
  sentencePositionBias: 'natural',
  maxOverlapWithHeading: 0.4,
};

// STRICT: Words that CANNOT start or end anchor text
const BOUNDARY_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
  'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'must', 'shall', 'can', 'need', 'this', 'that', 'these', 'those',
  'it', 'its', 'they', 'their', 'what', 'which', 'who', 'when', 'where', 'why',
  'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'also', 'now', 'here', 'there', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then',
  'once', 'any', 'about', 'over', 'being', 'you', 'your', 'we', 'our', 'us',
  'isn\'t', 'aren\'t', 'wasn\'t', 'weren\'t', 'don\'t', 'doesn\'t', 'didn\'t',
  'won\'t', 'wouldn\'t', 'couldn\'t', 'shouldn\'t', 'can\'t', 'cannot',
]);

// TOXIC: Generic anchors that DESTROY SEO value - instant rejection
const TOXIC_GENERIC_ANCHORS = new Set([
  'click here', 'read more', 'learn more', 'find out more', 'check it out',
  'this article', 'this guide', 'this post', 'this page', 'this link',
  'here', 'link', 'website', 'site', 'more info', 'more information',
  'click', 'tap here', 'go here', 'see more', 'view more', 'continue reading',
]);

// REQUIRED: At least one of these words must appear for anchor to be valid
const REQUIRED_DESCRIPTIVE_WORDS = new Set([
  'guide', 'tutorial', 'tips', 'strategies', 'techniques', 'methods', 'steps',
  'best', 'practices', 'complete', 'comprehensive', 'ultimate', 'proven', 'effective',
  'essential', 'advanced', 'beginner', 'professional', 'expert', 'care', 'training',
  'health', 'nutrition', 'grooming', 'behavior', 'breed', 'puppy', 'dog', 'pet',
  'approach', 'framework', 'system', 'process', 'checklist', 'resources', 'tools',
  'benefits', 'solutions', 'recommendations', 'insights', 'overview', 'basics',
]);

// SEO power patterns for bonus points
const SEO_POWER_PATTERNS = [
  { pattern: /\b(complete|comprehensive|ultimate|definitive)\s+\w+\s+guide\b/i, boost: 20 },
  { pattern: /\b(step[- ]by[- ]step|how[- ]to)\s+\w+/i, boost: 15 },
  { pattern: /\b(best|top|proven|effective)\s+(practices|strategies|techniques|methods|tips)/i, boost: 18 },
  { pattern: /\b(beginner|advanced|expert|professional)\s+\w+\s+(guide|tips)/i, boost: 15 },
  { pattern: /\b(essential|critical|important)\s+\w+\s+(tips|strategies|guide)/i, boost: 12 },
];

console.log('[UltraPremiumAnchorEngineV2] STRICT VALIDATION Module Initialized v2.1');

// ==================== STRICT VALIDATION FUNCTION ====================

export const validateAnchorText = (
  anchor: string,
  config: UltraAnchorConfig = ULTRA_CONFIG
): { valid: boolean; reason: string } => {
  const cleanAnchor = anchor.trim().replace(/[.,!?;:]+$/, '').trim();
  const words = cleanAnchor.split(/\s+/).filter(w => w.length > 0);
  
  // Check 1: Word count (4-7 words)
  if (words.length < config.minWords) {
    return { valid: false, reason: `Too short: ${words.length} words, need ${config.minWords}+` };
  }
  if (words.length > config.maxWords) {
    return { valid: false, reason: `Too long: ${words.length} words, max ${config.maxWords}` };
  }
  
  // Check 2: Toxic generic anchors
  const anchorLower = cleanAnchor.toLowerCase();
  for (const toxic of TOXIC_GENERIC_ANCHORS) {
    if (anchorLower.includes(toxic)) {
      return { valid: false, reason: `Contains toxic generic phrase: "${toxic}"` };
    }
  }
  
  // Check 3: STRICT - First word cannot be a stopword
  const firstWord = words[0].toLowerCase().replace(/[^a-z']/g, '');
  if (BOUNDARY_STOPWORDS.has(firstWord)) {
    return { valid: false, reason: `Cannot START with stopword: "${firstWord}"` };
  }
  
  // Check 4: STRICT - Last word cannot be a stopword
  const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z']/g, '');
  if (BOUNDARY_STOPWORDS.has(lastWord)) {
    return { valid: false, reason: `Cannot END with stopword: "${lastWord}"` };
  }
  
  // Check 5: Must contain at least one descriptive word
  const hasDescriptiveWord = words.some(w => 
    REQUIRED_DESCRIPTIVE_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''))
  );
  if (!hasDescriptiveWord) {
    return { valid: false, reason: `Must contain descriptive word (guide, tips, strategies, etc.)` };
  }
  
  // Check 6: Cannot be just a sentence fragment ending with verb
  const fragmentPatterns = [
    /\b(is|are|was|were|isn't|aren't|wasn't|weren't)$/i,
    /\b(can|could|will|would|should|might|may)$/i,
    /\b(have|has|had|do|does|did)$/i,
    /\b(and|or|but|that|which|who)$/i,
  ];
  for (const pattern of fragmentPatterns) {
    if (pattern.test(cleanAnchor)) {
      return { valid: false, reason: `Incomplete sentence fragment detected` };
    }
  }
  
  return { valid: true, reason: 'OK' };
};

// ==================== HELPER FUNCTIONS ====================

const extractSemanticEntities = (text: string): SemanticEntity[] => {
  const entities: SemanticEntity[] = [];
  const topicPatterns = [
    /\b([a-z]+\s+){1,3}(strategy|technique|method|approach|framework|system|process)/gi,
    /\b([a-z]+\s+){1,2}(training|care|health|nutrition|grooming|behavior)/gi,
    /\b(french bulldog|frenchie|brachycephalic|puppy|dog|breed)\s+[a-z]+/gi,
  ];
  topicPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => {
      entities.push({ text: match.trim(), type: 'topic', confidence: 0.85, synonyms: [], relatedConcepts: [] });
    });
  });
  return entities;
};

const calculateDeepSemanticScore = (anchor: string, targetPage: PageContext, paragraphContext: string): number => {
  const anchorLower = anchor.toLowerCase();
  const titleLower = targetPage.title.toLowerCase();
  const descLower = (targetPage.description || '').toLowerCase();
  const getWords = (text: string): string[] => text.split(/\s+/).filter(w => w.length > 2 && !BOUNDARY_STOPWORDS.has(w));
  const anchorWords = new Set(getWords(anchorLower));
  const titleWords = new Set(getWords(titleLower));
  const descWords = new Set(getWords(descLower));
  const contextWords = new Set(getWords(paragraphContext.toLowerCase()));
  const titleOverlap = [...anchorWords].filter(w => titleWords.has(w)).length;
  const descOverlap = [...anchorWords].filter(w => descWords.has(w)).length;
  const contextOverlap = [...anchorWords].filter(w => contextWords.has(w)).length;
  const titleScore = anchorWords.size > 0 ? (titleOverlap / anchorWords.size) * 40 : 0;
  const descScore = anchorWords.size > 0 ? (descOverlap / anchorWords.size) * 25 : 0;
  const contextScore = anchorWords.size > 0 ? (contextOverlap / anchorWords.size) * 20 : 0;
  let keywordBonus = 0;
  if (targetPage.primaryKeyword && anchorLower.includes(targetPage.primaryKeyword.toLowerCase())) keywordBonus = 15;
  targetPage.secondaryKeywords?.forEach(kw => { if (anchorLower.includes(kw.toLowerCase())) keywordBonus += 5; });
  return Math.min(100, titleScore + descScore + contextScore + keywordBonus);
};

const calculateNaturalnessScore = (anchor: string, sentence: string): number => {
  let score = 50;
  const words = anchor.split(/\s+/);
  if (words.length >= 4 && words.length <= 6) score += 20;
  else if (words.length === 7) score += 10;
  else if (words.length < 4) score -= 30;
  
  // Bonus for SEO power patterns
  for (const { pattern, boost } of SEO_POWER_PATTERNS) {
    if (pattern.test(anchor)) {
      score += boost;
      break;
    }
  }
  
  return Math.max(0, Math.min(100, score));
};

const calculateSEOScore = (anchor: string, targetPage: PageContext): number => {
  // STRICT: Run validation first
  const validation = validateAnchorText(anchor);
  if (!validation.valid) {
    return 0; // Instant fail
  }
  
  let score = 50;
  const anchorLower = anchor.toLowerCase();
  
  // Apply SEO power pattern boosts
  for (const { pattern, boost } of SEO_POWER_PATTERNS) {
    if (pattern.test(anchor)) score += boost;
  }
  
  // Primary keyword presence
  if (targetPage.primaryKeyword) {
    const kw = targetPage.primaryKeyword.toLowerCase();
    if (anchorLower.includes(kw)) score += 20;
    else {
      const kwWords = kw.split(/\s+/);
      const matchCount = kwWords.filter(w => anchorLower.includes(w)).length;
      score += (matchCount / kwWords.length) * 10;
    }
  }
  
  // Descriptive word bonus
  const words = anchor.split(/\s+/);
  const descriptiveCount = words.filter(w => 
    REQUIRED_DESCRIPTIVE_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''))
  ).length;
  score += descriptiveCount * 8;
  
  return Math.min(100, score);
};

const extractParagraphTheme = (text: string): string => {
  const words = text.toLowerCase().split(/\s+/);
  const freq: Record<string, number> = {};
  words.forEach(w => { if (w.length > 4 && !BOUNDARY_STOPWORDS.has(w)) freq[w] = (freq[w] || 0) + 1; });
  const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
  return sorted.slice(0, 3).map(([w]) => w).join(' ');
};

const extractUltraAnchorCandidates = (paragraph: string, targetPage: PageContext, config: UltraAnchorConfig = ULTRA_CONFIG): UltraAnchorCandidate[] => {
  const candidates: UltraAnchorCandidate[] = [];
  const text = paragraph.replace(/<[^>]*>/g, ' ').trim();
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length < config.minWords) return candidates;
  
  for (let len = config.minWords; len <= config.maxWords; len++) {
    for (let start = 0; start <= words.length - len; start++) {
      const phraseWords = words.slice(start, start + len);
      const phrase = phraseWords.join(' ');
      const cleanPhrase = phrase.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9.,!?]+$/g, '').trim();
      
      if (cleanPhrase.length < 15) continue;
      
      // STRICT: Validate anchor before considering it
      const validation = validateAnchorText(cleanPhrase, config);
      if (!validation.valid) {
        continue; // Skip invalid anchors
      }
      
      const containingSentence = sentences.find(s => s.toLowerCase().includes(cleanPhrase.toLowerCase())) || text;
      const semanticScore = calculateDeepSemanticScore(cleanPhrase, targetPage, text);
      const naturalScore = calculateNaturalnessScore(cleanPhrase, containingSentence);
      const seoScore = calculateSEOScore(cleanPhrase, targetPage);
      
      if (seoScore === 0) continue; // Failed validation
      
      const qualityScore = (semanticScore * config.semanticWeight + naturalScore * config.naturalWeight + seoScore * config.seoWeight) * 100 / (config.semanticWeight + config.naturalWeight + config.seoWeight);
      
      if (qualityScore < config.minQualityScore) continue;
      
      const posRatio = start / words.length;
      const position = posRatio < 0.3 ? 'early' : posRatio > 0.7 ? 'late' : 'middle';
      
      candidates.push({
        text: cleanPhrase, normalizedText: cleanPhrase.toLowerCase(), qualityScore, semanticScore,
        contextualFit: semanticScore * 0.7 + naturalScore * 0.3, readabilityScore: naturalScore,
        seoValue: seoScore, naturalness: naturalScore, wordCount: phraseWords.length, position,
        sentenceRole: 'complement', entities: extractSemanticEntities(cleanPhrase),
        contextWindow: { before: words.slice(Math.max(0, start - 5), start).join(' '), target: cleanPhrase,
          after: words.slice(start + len, start + len + 5).join(' '), sentenceContext: containingSentence,
          paragraphTheme: extractParagraphTheme(text), documentTopics: targetPage.topics || [] },
      });
    }
  }
  
  candidates.sort((a, b) => b.qualityScore - a.qualityScore);
  const seen = new Set<string>();
  return candidates.filter(c => { 
    const key = c.normalizedText.replace(/[^a-z0-9]/g, ''); 
    if (seen.has(key)) return false; 
    seen.add(key); 
    return true; 
  }).slice(0, 10);
};

// ==================== MAIN ENGINE CLASS ====================

export class UltraPremiumAnchorEngineV2 {
  private config: UltraAnchorConfig;
  private usedAnchors: Set<string>;
  private usedTargets: Set<string>;
  private injectionHistory: AnchorInjectionResult[];
  
  constructor(config: Partial<UltraAnchorConfig> = {}) {
    this.config = { ...ULTRA_CONFIG, ...config };
    this.usedAnchors = new Set();
    this.usedTargets = new Set();
    this.injectionHistory = [];
    console.log(`[UltraPremiumAnchorEngineV2] STRICT validation enabled - ${this.config.minWords}-${this.config.maxWords} words`);
  }
  
  reset(): void {
    this.usedAnchors.clear();
    this.usedTargets.clear();
    this.injectionHistory = [];
  }
  
  findBestAnchor(paragraph: string, targetPage: PageContext, nearbyHeading?: string): UltraAnchorCandidate | null {
    const candidates = extractUltraAnchorCandidates(paragraph, targetPage, this.config);
    const available = candidates.filter(c => {
      const key = c.normalizedText.replace(/[^a-z0-9]/g, '');
      return !this.usedAnchors.has(key);
    });
    
    if (available.length === 0) {
      console.log(`[UltraPremiumAnchorEngineV2] No valid anchors found for "${targetPage.slug}"`);
      return null;
    }
    
    if (nearbyHeading && this.config.maxOverlapWithHeading < 1) {
      const headingWords = new Set(nearbyHeading.toLowerCase().split(/\s+/).filter(w => w.length > 3));
      for (const candidate of available) {
        const anchorWords = candidate.normalizedText.split(/\s+/).filter(w => w.length > 3);
        const overlap = anchorWords.filter(w => headingWords.has(w)).length;
        const ratio = overlap / Math.max(anchorWords.length, 1);
        if (ratio <= this.config.maxOverlapWithHeading) {
          console.log(`[UltraPremiumAnchorEngineV2] Selected: "${candidate.text}" (${candidate.wordCount} words, score: ${candidate.qualityScore.toFixed(1)})`);
          return candidate;
        }
      }
    }
    
    const selected = available[0];
    console.log(`[UltraPremiumAnchorEngineV2] Selected: "${selected.text}" (${selected.wordCount} words, score: ${selected.qualityScore.toFixed(1)})`);
    return selected;
  }
  
  injectLink(html: string, anchor: string, targetUrl: string): { html: string; result: AnchorInjectionResult } {
    // STRICT: Final validation before injection
    const validation = validateAnchorText(anchor, this.config);
    if (!validation.valid) {
      console.warn(`[UltraPremiumAnchorEngineV2] REJECTED: "${anchor}" - ${validation.reason}`);
      return {
        html,
        result: {
          success: false, anchor, targetUrl,
          qualityMetrics: { overall: 0, semantic: 0, contextual: 0, natural: 0, seo: 0 },
          position: -1, reasoning: `REJECTED: ${validation.reason}`
        }
      };
    }
    
    const escapedAnchor = escapeRegExp(anchor);
    const regex = new RegExp(`(>[^<]*?)\\b(${escapedAnchor})\\b(?![^<]*<\\/a>)`, 'i');
    let injected = false;
    let position = -1;
    
    const newHtml = html.replace(regex, (match, prefix, text, offset) => {
      if (injected) return match;
      injected = true;
      position = offset;
      return `${prefix}<a href="${targetUrl}">${text}</a>`;
    });
    
    const result: AnchorInjectionResult = {
      success: injected, anchor, targetUrl,
      qualityMetrics: { overall: 85, semantic: 80, contextual: 85, natural: 90, seo: 85 },
      position, reasoning: injected ? `✅ Injected high-quality anchor: "${anchor}"` : `Failed to find injection point`
    };
    
    if (injected) {
      this.usedAnchors.add(anchor.toLowerCase().replace(/[^a-z0-9]/g, ''));
      this.injectionHistory.push(result);
      console.log(`[UltraPremiumAnchorEngineV2] ✅ SUCCESS: "${anchor}" → ${targetUrl}`);
    }
    
    return { html: newHtml, result };
  }
  
  getStats() {
    return {
      totalInjections: this.injectionHistory.length,
      uniqueAnchors: this.usedAnchors.size,
      uniqueTargets: this.usedTargets.size,
      history: this.injectionHistory
    };
  }
}

export default UltraPremiumAnchorEngineV2;
