// src/lib/sota/NeuronWriterService.ts
// SOTA NeuronWriter Service v3.0 - Enterprise-Grade SEO Data Extraction

export interface NeuronWriterTermData {
  term: string;
  type: 'basic' | 'extended' | 'entity';
  weight: number;
  recommended: number;  // recommended count
  found: number;        // current count in content
  status: 'missing' | 'underused' | 'optimal' | 'overused';
}

export interface NeuronWriterHeadingData {
  text: string;
  level: 'h1' | 'h2' | 'h3';
  source: string;       // competitor URL or suggestion source
  relevanceScore: number;
}

export interface NeuronWriterAnalysis {
  queryId: string;
  keyword: string;
  language: string;
  
  // Organized sections
  basicKeywords: NeuronWriterTermData[];
  extendedKeywords: NeuronWriterTermData[];
  entities: NeuronWriterTermData[];
  
  // Heading recommendations
  h1Suggestions: NeuronWriterHeadingData[];
  h2Suggestions: NeuronWriterHeadingData[];
  h3Suggestions: NeuronWriterHeadingData[];
  
  // Competitor analysis
  competitorData: {
    url: string;
    title: string;
    wordCount: number;
    score: number;
  }[];
  
  // Recommended content parameters
  recommendations: {
    targetWordCount: number;
    targetScore: number;
    minH2Count: number;
    minH3Count: number;
    contentGaps: string[];
  };
  
  // All terms flattened for prompt injection
  allTerms: string[];
  
  // Raw data for debugging
  rawData?: unknown;
}

export interface NeuronWriterProxyResponse {
  success: boolean;
  status?: number;
  data?: any;
  error?: string;
}

const API_PROXY_ENDPOINTS = [
  '/api/neuronwriter-proxy',      // Express server
  '/api/neuronwriter',            // Cloudflare Pages / Vercel
];

/**
 * Find a working proxy endpoint for NeuronWriter API calls.
 */
async function getWorkingProxy(): Promise<string> {
  for (const endpoint of API_PROXY_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: '/list-projects', apiKey: 'test', body: {} }),
      });
      if (res.ok || res.status === 200) return endpoint;
    } catch {
      continue;
    }
  }
  return API_PROXY_ENDPOINTS[0]; // Fallback
}

/**
 * Makes a proxied request to the NeuronWriter API.
 */
async function neuronRequest(
  proxyEndpoint: string,
  apiKey: string,
  endpoint: string,
  body?: Record<string, unknown>
): Promise<NeuronWriterProxyResponse> {
  const res = await fetch(proxyEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-NeuronWriter-Key': apiKey,
    },
    body: JSON.stringify({ endpoint, apiKey, body }),
  });

  return res.json();
}

/**
 * Parses raw NeuronWriter query data into structured analysis.
 */
function parseQueryData(rawData: any, keyword: string): NeuronWriterAnalysis {
  const basicKeywords: NeuronWriterTermData[] = [];
  const extendedKeywords: NeuronWriterTermData[] = [];
  const entities: NeuronWriterTermData[] = [];
  const h1Suggestions: NeuronWriterHeadingData[] = [];
  const h2Suggestions: NeuronWriterHeadingData[] = [];
  const h3Suggestions: NeuronWriterHeadingData[] = [];
  const competitorData: NeuronWriterAnalysis['competitorData'] = [];
  const allTerms: string[] = [];

  // Parse terms/keywords
  const terms = rawData?.terms || rawData?.data?.terms || rawData?.keywords || [];
  if (Array.isArray(terms)) {
    for (const term of terms) {
      const termText = term.term || term.keyword || term.text || term.name || '';
      if (!termText) continue;

      const weight = term.weight || term.importance || term.score || 50;
      const recommended = term.recommended || term.rec || term.target || 2;
      const found = term.found || term.count || term.current || 0;
      const type = term.type === 'entity' ? 'entity' :
                   (weight >= 70 || term.type === 'basic') ? 'basic' : 'extended';

      const status: NeuronWriterTermData['status'] = 
        found === 0 ? 'missing' :
        found < recommended ? 'underused' :
        found <= recommended * 1.5 ? 'optimal' : 'overused';

      const termData: NeuronWriterTermData = {
        term: termText,
        type,
        weight,
        recommended,
        found,
        status,
      };

      allTerms.push(termText);

      switch (type) {
        case 'basic': basicKeywords.push(termData); break;
        case 'extended': extendedKeywords.push(termData); break;
        case 'entity': entities.push(termData); break;
      }
    }
  }

  // Parse entities separately if provided
  const rawEntities = rawData?.entities || rawData?.data?.entities || [];
  if (Array.isArray(rawEntities)) {
    for (const entity of rawEntities) {
      const name = entity.name || entity.entity || entity.text || '';
      if (!name || allTerms.includes(name)) continue;

      entities.push({
        term: name,
        type: 'entity',
        weight: entity.weight || entity.importance || 60,
        recommended: entity.recommended || 1,
        found: entity.found || 0,
        status: 'missing',
      });
      allTerms.push(name);
    }
  }

  // Parse heading suggestions
  const headings = rawData?.headings || rawData?.data?.headings || rawData?.headers || [];
  if (Array.isArray(headings)) {
    for (const heading of headings) {
      const text = heading.text || heading.heading || heading.title || '';
      if (!text) continue;
      const level = heading.level || heading.tag || 'h2';
      const source = heading.source || heading.url || 'NeuronWriter suggestion';
      const relevance = heading.relevance || heading.score || 70;

      const headingData: NeuronWriterHeadingData = {
        text,
        level: level.toLowerCase().startsWith('h1') ? 'h1' : level.toLowerCase().startsWith('h3') ? 'h3' : 'h2',
        source,
        relevanceScore: relevance,
      };

      switch (headingData.level) {
        case 'h1': h1Suggestions.push(headingData); break;
        case 'h2': h2Suggestions.push(headingData); break;
        case 'h3': h3Suggestions.push(headingData); break;
      }
    }
  }

  // Parse competitor data
  const competitors = rawData?.competitors || rawData?.data?.competitors || rawData?.serp || [];
  if (Array.isArray(competitors)) {
    for (const comp of competitors) {
      competitorData.push({
        url: comp.url || comp.link || '',
        title: comp.title || '',
        wordCount: comp.wordCount || comp.word_count || 0,
        score: comp.score || comp.nw_score || 0,
      });
    }
  }

  // Calculate recommendations
  const avgCompWordCount = competitorData.length > 0
    ? Math.round(competitorData.reduce((s, c) => s + c.wordCount, 0) / competitorData.length)
    : 2500;

  return {
    queryId: rawData?.query_id || rawData?.id || '',
    keyword,
    language: rawData?.language || rawData?.lang || 'en',
    basicKeywords: basicKeywords.sort((a, b) => b.weight - a.weight),
    extendedKeywords: extendedKeywords.sort((a, b) => b.weight - a.weight),
    entities: entities.sort((a, b) => b.weight - a.weight),
    h1Suggestions: h1Suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore),
    h2Suggestions: h2Suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore),
    h3Suggestions: h3Suggestions.sort((a, b) => b.relevanceScore - a.relevanceScore),
    competitorData,
    recommendations: {
      targetWordCount: Math.max(2500, Math.round(avgCompWordCount * 1.2)),
      targetScore: 90,
      minH2Count: Math.max(5, h2Suggestions.length > 0 ? Math.min(h2Suggestions.length, 10) : 7),
      minH3Count: Math.max(3, h3Suggestions.length > 0 ? Math.min(h3Suggestions.length, 15) : 5),
      contentGaps: allTerms.filter(t => {
        const td = [...basicKeywords, ...extendedKeywords, ...entities].find(d => d.term === t);
        return td && td.status === 'missing';
      }).slice(0, 20),
    },
    allTerms,
    rawData,
  };
}

/**
 * Fetches and parses NeuronWriter data for a given query.
 */
export async function fetchNeuronWriterAnalysis(
  apiKey: string,
  queryId: string,
  keyword: string
): Promise<NeuronWriterAnalysis | null> {
  try {
    const proxy = await getWorkingProxy();
    const response = await neuronRequest(proxy, apiKey, '/get-query', { query: queryId });

    if (!response.success || !response.data) {
      console.error('[NeuronWriter] Failed to fetch query data:', response.error);
      return null;
    }

    return parseQueryData(response.data, keyword);
  } catch (error) {
    console.error('[NeuronWriter] Error fetching analysis:', error);
    return null;
  }
}

/**
 * Builds a structured prompt section from NeuronWriter analysis data.
 * This is injected into the AI content generation prompt.
 */
export function buildNeuronWriterPromptSection(analysis: NeuronWriterAnalysis): string {
  const sections: string[] = [];

  sections.push(`\n=== NEURONWRITER SEO OPTIMIZATION DATA ===`);
  sections.push(`Target Keyword: "${analysis.keyword}"`);
  sections.push(`Target Word Count: ${analysis.recommendations.targetWordCount}+`);
  sections.push(`Target Score: ${analysis.recommendations.targetScore}%+`);

  // Basic Keywords (highest priority)
  if (analysis.basicKeywords.length > 0) {
    sections.push(`\n--- BASIC KEYWORDS (HIGH PRIORITY - MUST USE ALL) ---`);
    sections.push(`Incorporate each of these terms naturally ${analysis.basicKeywords.length > 0 ? analysis.basicKeywords[0].recommended : 2}+ times:`);
    for (const kw of analysis.basicKeywords.slice(0, 30)) {
      sections.push(`  • "${kw.term}" (weight: ${kw.weight}, use ${kw.recommended}x)`);
    }
  }

  // Extended Keywords
  if (analysis.extendedKeywords.length > 0) {
    sections.push(`\n--- EXTENDED KEYWORDS (MEDIUM PRIORITY - USE MOST) ---`);
    sections.push(`Weave these terms naturally into the content:`);
    for (const kw of analysis.extendedKeywords.slice(0, 25)) {
      sections.push(`  • "${kw.term}" (weight: ${kw.weight}, use ${kw.recommended}x)`);
    }
  }

  // Entities
  if (analysis.entities.length > 0) {
    sections.push(`\n--- ENTITIES (SEMANTIC RELEVANCE - INCLUDE NATURALLY) ---`);
    sections.push(`Reference these entities/concepts to boost topical authority:`);
    for (const entity of analysis.entities.slice(0, 20)) {
      sections.push(`  • "${entity.term}" (weight: ${entity.weight})`);
    }
  }

  // H1 Suggestions
  if (analysis.h1Suggestions.length > 0) {
    sections.push(`\n--- H1 TITLE SUGGESTIONS ---`);
    for (const h of analysis.h1Suggestions.slice(0, 5)) {
      sections.push(`  • "${h.text}" (relevance: ${h.relevanceScore})`);
    }
  }

  // H2 Headings
  if (analysis.h2Suggestions.length > 0) {
    sections.push(`\n--- H2 HEADING SUGGESTIONS (USE OR ADAPT THESE) ---`);
    for (const h of analysis.h2Suggestions.slice(0, 12)) {
      sections.push(`  • "${h.text}" (relevance: ${h.relevanceScore})`);
    }
  }

  // H3 Headings
  if (analysis.h3Suggestions.length > 0) {
    sections.push(`\n--- H3 SUBHEADING SUGGESTIONS ---`);
    for (const h of analysis.h3Suggestions.slice(0, 15)) {
      sections.push(`  • "${h.text}" (relevance: ${h.relevanceScore})`);
    }
  }

  // Content Gaps
  if (analysis.recommendations.contentGaps.length > 0) {
    sections.push(`\n--- CONTENT GAPS (MISSING TERMS - CRITICAL TO ADD) ---`);
    sections.push(`These terms are completely missing — you MUST include them:`);
    sections.push(`  ${analysis.recommendations.contentGaps.join(', ')}`);
  }

  sections.push(`\n=== END NEURONWRITER DATA ===\n`);

  return sections.join('\n');
}

/**
 * Scores existing content against NeuronWriter terms.
 * Returns a 0-100 score indicating term coverage.
 */
export function scoreContentAgainstNeuron(
  htmlContent: string,
  analysis: NeuronWriterAnalysis
): { score: number; missing: string[]; underused: string[]; optimal: string[] } {
  const plainText = htmlContent.replace(/<[^>]*>/g, ' ').toLowerCase();
  const missing: string[] = [];
  const underused: string[] = [];
  const optimal: string[] = [];

  const allTerms = [...analysis.basicKeywords, ...analysis.extendedKeywords, ...analysis.entities];
  let totalWeight = 0;
  let achievedWeight = 0;

  for (const term of allTerms) {
    totalWeight += term.weight;
    const termLower = term.term.toLowerCase();
    const regex = new RegExp(termLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = plainText.match(regex);
    const count = matches ? matches.length : 0;

    if (count === 0) {
      missing.push(term.term);
    } else if (count < term.recommended) {
      underused.push(term.term);
      achievedWeight += term.weight * (count / term.recommended);
    } else {
      optimal.push(term.term);
      achievedWeight += term.weight;
    }
  }

  const score = totalWeight > 0 ? Math.round((achievedWeight / totalWeight) * 100) : 0;

  return { score, missing, underused, optimal };
}

export default {
  fetchNeuronWriterAnalysis,
  buildNeuronWriterPromptSection,
  scoreContentAgainstNeuron,
};
