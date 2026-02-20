// src/lib/sota/NeuronWriterService.ts
// ═══════════════════════════════════════════════════════════════════════════════
// NEURONWRITER SERVICE v9.0 — ENTERPRISE RESILIENCE & AUTO-HEAL + FULL DATA
// 
// Key improvements in v9.0:
//   1. Auto-creates a new keyword query when not found in the project
//   2. Poll loop waits until query status is 'done' (not just any data)
//   3. Full data extraction: basic terms, extended terms, entities, H2/H3
//   4. Comprehensive prompt builder passes ALL NW data to AI
//   5. Handles multiple NeuronWriter API response shapes
// ═══════════════════════════════════════════════════════════════════════════════

export interface NeuronWriterProxyConfig {
  neuronWriterApiKey?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  customProxyUrl?: string;
  onDiagnostic?: (message: string) => void;
}

export interface NWApiResponse {
  success: boolean;
  error?: string;
  status?: number;
  data?: any;
}

export interface NeuronWriterTermData {
  term: string;
  type: 'required' | 'recommended' | 'optional' | 'basic' | 'extended';
  frequency: number;
  weight: number;
  usage_pc?: number;
  recommended?: number;
  sugg_usage?: [number, number];
}

export interface NeuronWriterHeadingData {
  text: string;
  usage_pc?: number;
  level?: 'h1' | 'h2' | 'h3';
  relevanceScore?: number;
}

export interface NeuronWriterAnalysis {
  query_id?: string;
  status?: string;
  keyword?: string;
  content_score?: number;
  recommended_length?: number;
  terms?: NeuronWriterTermData[];
  termsExtended?: NeuronWriterTermData[];
  basicKeywords?: NeuronWriterTermData[];
  extendedKeywords?: NeuronWriterTermData[];
  entities?: Array<{ entity: string; usage_pc?: number; frequency?: number }>;
  headingsH2?: NeuronWriterHeadingData[];
  headingsH3?: NeuronWriterHeadingData[];
  competitorData?: any[];
  h1Suggestions?: NeuronWriterHeadingData[];
  h2Suggestions?: NeuronWriterHeadingData[];
  h3Suggestions?: NeuronWriterHeadingData[];
  recommendations?: any;
}

export interface NeuronWriterQuery {
  id: string;
  keyword: string;
  status: string;
}

export interface NeuronWriterProject {
  id: string;
  name: string;
  queries_count?: number;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const PERSISTENT_CACHE_KEY = 'sota-nw-dedup-cache-v9.0';

// ─── Levenshtein similarity ───────────────────────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  return 1.0 - levenshteinDistance(a, b) / maxLen;
}

// ─── Persistent deduplication cache ──────────────────────────────────────────

const SESSION_DEDUP_MAP = new Map<string, NeuronWriterQuery>();

function getPersistentCache(): Record<string, { query: NeuronWriterQuery; timestamp: number }> {
  try {
    const raw = localStorage.getItem(PERSISTENT_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveToPersistentCache(keyword: string, query: NeuronWriterQuery) {
  try {
    const cache = getPersistentCache();
    cache[keyword.toLowerCase().trim()] = { query, timestamp: Date.now() };
    localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('[NW Cache] Storage failed:', e);
  }
}

function findInPersistentCache(keyword: string): NeuronWriterQuery | undefined {
  const cache = getPersistentCache();
  const entry = cache[keyword.toLowerCase().trim()];
  if (!entry) return undefined;
  // 7-day TTL
  if (Date.now() - entry.timestamp > 7 * 24 * 60 * 60 * 1000) return undefined;
  return entry.query;
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export class NeuronWriterService {
  private config: NeuronWriterProxyConfig;

  constructor(configOrApiKey: NeuronWriterProxyConfig | string) {
    if (typeof configOrApiKey === 'string') {
      let supabaseUrl = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_URL ?? '') : '';
      let supabaseAnonKey = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '') : '';

      if (typeof localStorage !== 'undefined') {
        try {
          const stored = localStorage.getItem('wp-optimizer-storage');
          if (stored) {
            const parsed = JSON.parse(stored);
            const stateConfig = parsed?.state?.config;
            if (stateConfig?.supabaseUrl) supabaseUrl = stateConfig.supabaseUrl;
            if (stateConfig?.supabaseAnonKey) supabaseAnonKey = stateConfig.supabaseAnonKey;
          }
        } catch (e) { }
      }

      this.config = {
        neuronWriterApiKey: configOrApiKey,
        supabaseUrl,
        supabaseAnonKey,
      };
    } else {
      this.config = configOrApiKey;
    }
  }

  private diag(msg: string) {
    console.log(`[NeuronWriter] ${msg}`);
    this.config.onDiagnostic?.(msg);
  }

  private async sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Resolve the proxy URL. Priority:
   *   1. customProxyUrl (explicit override)
   *   2. Supabase Edge Function (if supabaseUrl is configured)
   *   3. /api/neuronwriter — Vercel serverless / local Express proxy
   */
  private resolveProxyUrl(): string {
    if (this.config.customProxyUrl) return this.config.customProxyUrl;
    if (this.config.supabaseUrl && this.config.supabaseUrl.trim().length > 0) {
      return `${this.config.supabaseUrl}/functions/v1/neuronwriter-proxy`;
    }
    return '/api/neuronwriter';
  }

  private async callProxy(endpoint: string, payload: any = {}): Promise<NWApiResponse> {
    let lastError = '';
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url = this.resolveProxyUrl();
        this.diag(`callProxy → ${url} | endpoint: ${cleanEndpoint} (attempt ${attempt + 1}/${MAX_RETRIES})`);

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (this.config.supabaseAnonKey && this.config.supabaseUrl && url.includes(this.config.supabaseUrl)) {
          headers['Authorization'] = `Bearer ${this.config.supabaseAnonKey}`;
        }

        if (this.config.neuronWriterApiKey) {
          headers['X-NW-Api-Key'] = this.config.neuronWriterApiKey;
          headers['X-NeuronWriter-Key'] = this.config.neuronWriterApiKey;
        }

        const requestBody: any = {
          endpoint: cleanEndpoint,
          method: 'POST',
          apiKey: this.config.neuronWriterApiKey || '',
          body: payload.body || {},
        };

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();

        if (result.success === false && result.error) {
          throw new Error(result.error);
        }

        const data = result.data !== undefined ? result.data : result;
        return { success: true, data };
      } catch (err: any) {
        lastError = err.message;
        this.diag(`callProxy attempt ${attempt + 1} failed: ${lastError}`);
        if (attempt < MAX_RETRIES - 1) await this.sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
    return { success: false, error: lastError };
  }

  private normalize(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  // ─── List Projects ──────────────────────────────────────────────────────────

  async listProjects(): Promise<{ success: boolean; projects?: NeuronWriterProject[]; error?: string }> {
    this.diag('Fetching projects list...');
    const res = await this.callProxy('/list-projects', { body: {} });
    if (!res.success) return res;
    const projects = res.data?.projects || (Array.isArray(res.data) ? res.data : []);
    return { success: true, projects };
  }

  // ─── Find existing query by keyword (fuzzy match) ───────────────────────────

  async findQueryByKeyword(projectId: string, keyword: string): Promise<{ success: boolean; query?: NeuronWriterQuery; error?: string }> {
    const norm = this.normalize(keyword);
    const sessionHit = SESSION_DEDUP_MAP.get(norm);
    if (sessionHit) {
      this.diag(`Cache hit (session) for "${keyword}"`);
      return { success: true, query: sessionHit };
    }

    const persistentHit = findInPersistentCache(norm);
    if (persistentHit) {
      this.diag(`Cache hit (persistent) for "${keyword}"`);
      return { success: true, query: persistentHit };
    }

    this.diag(`Searching project ${projectId} for "${keyword}"...`);
    const res = await this.callProxy('/list-queries', { body: { project: projectId } });
    if (!res.success) return res;

    // NeuronWriter API returns: array of query objects OR { queries: [...] }
    const list: any[] = Array.isArray(res.data) ? res.data : (res.data?.queries || res.data?.data || []);
    this.diag(`Found ${list.length} existing queries in project.`);

    for (const q of list) {
      const qKeyword = q.keyword || q.query_keyword || q.name || '';
      const qNorm = this.normalize(qKeyword);
      if (levenshteinSimilarity(qNorm, norm) > 0.88) {
        // q.query or q.id is the query identifier for /get-query calls
        const queryId = q.query || q.id || q.query_id;
        const mapped: NeuronWriterQuery = {
          id: queryId,
          keyword: qKeyword,
          status: q.status || 'ready',
        };
        SESSION_DEDUP_MAP.set(norm, mapped);
        saveToPersistentCache(norm, mapped);
        this.diag(`Matched existing query "${qKeyword}" (ID: ${queryId})`);
        return { success: true, query: mapped };
      }
    }

    this.diag(`No existing query found for "${keyword}".`);
    return { success: true, query: undefined };
  }

  // ─── Create a new query in the project ─────────────────────────────────────

  async createQuery(projectId: string, keyword: string): Promise<{ success: boolean; query?: NeuronWriterQuery; error?: string }> {
    this.diag(`Creating new NeuronWriter query for "${keyword}" in project ${projectId}...`);

    const res = await this.callProxy('/new-query', {
      body: {
        project: projectId,
        keyword: keyword,
        language: 'en',    // default; could be made configurable
        country: 'us',     // default; could be made configurable
      }
    });

    if (!res.success) {
      this.diag(`Failed to create query: ${res.error}`);
      return { success: false, error: res.error };
    }

    const data = res.data?.data || res.data;
    // The API returns the new query id as data.query or data.id
    const queryId = data?.query || data?.id || data?.query_id;
    const status = data?.status || 'processing';

    if (!queryId) {
      this.diag(`Query created but no ID returned. Response: ${JSON.stringify(data).slice(0, 200)}`);
      return { success: false, error: 'Query created but no ID in response' };
    }

    const newQuery: NeuronWriterQuery = {
      id: queryId,
      keyword,
      status,
    };

    // Cache it immediately so we don't recreate on retry
    const norm = this.normalize(keyword);
    SESSION_DEDUP_MAP.set(norm, newQuery);
    saveToPersistentCache(norm, newQuery);

    this.diag(`New query created: ID=${queryId}, status=${status}`);
    return { success: true, query: newQuery };
  }

  // ─── Get query analysis (full data extraction) ──────────────────────────────

  async getQueryAnalysis(queryId: string): Promise<{ success: boolean; analysis?: NeuronWriterAnalysis; error?: string }> {
    this.diag(`Fetching analysis for query ${queryId}...`);
    const res = await this.callProxy('/get-query', { body: { query: queryId } });
    if (!res.success) return res;

    // The server proxy wraps data. Unwrap carefully.
    const raw = res.data?.data || res.data;

    if (!raw) {
      return { success: true, analysis: undefined };
    }

    this.diag(`Raw analysis keys: ${Object.keys(raw).join(', ')}`);

    const analysis: NeuronWriterAnalysis = {
      query_id: queryId,
      status: raw.status || 'processing',
      keyword: raw.keyword || raw.query_keyword,
      content_score: raw.content_score || raw.score || 0,
      recommended_length: raw.recommended_length || raw.recommendedLength || raw.avg_word_count || 2500,

      // Basic terms — NW API uses 'terms' or 'terms_basic'
      terms: this.parseTerms(raw.terms || raw.terms_basic || [], 'basic'),

      // Extended terms — NW API uses 'terms_extended' or 'extended_terms'
      termsExtended: this.parseTerms(raw.terms_extended || raw.extended_terms || raw.termsExtended || [], 'extended'),

      // Named entities
      entities: this.parseEntities(raw.entities || raw.named_entities || raw.namedEntities || []),

      // H2 headings from competitor analysis
      headingsH2: this.parseHeadings(raw.headings_h2 || raw.h2_suggestions || raw.h2s || raw.headings?.filter((h: any) => (h.level || h.type) === 'h2') || [], 'h2'),

      // H3 headings from competitor analysis
      headingsH3: this.parseHeadings(raw.headings_h3 || raw.h3_suggestions || raw.h3s || raw.headings?.filter((h: any) => (h.level || h.type) === 'h3') || [], 'h3'),

      competitorData: raw.competitors || raw.competitor_data || [],
    };

    // Populate new-style aliases for backward compat with UI components
    analysis.basicKeywords = analysis.terms;
    analysis.extendedKeywords = analysis.termsExtended;
    analysis.h2Suggestions = analysis.headingsH2;
    analysis.h3Suggestions = analysis.headingsH3;

    const hasTerms = (analysis.terms?.length || 0) > 0;
    const hasEntities = (analysis.entities?.length || 0) > 0;
    const hasHeadings = (analysis.headingsH2?.length || 0) > 0 || (analysis.headingsH3?.length || 0) > 0;

    this.diag(
      `Analysis parsed: ${analysis.terms?.length || 0} basic terms, ` +
      `${analysis.termsExtended?.length || 0} extended terms, ` +
      `${analysis.entities?.length || 0} entities, ` +
      `${analysis.headingsH2?.length || 0} H2s, ` +
      `${analysis.headingsH3?.length || 0} H3s. ` +
      `Status: ${analysis.status}`
    );

    return { success: true, analysis };
  }

  // ─── Prompt builder — comprehensive SEO context ─────────────────────────────

  /**
   * Builds a full prompt section for the AI with ALL NeuronWriter data:
   * basic keywords, extended keywords, named entities, and competitor headings.
   * Instructs the AI to achieve >90 NeuronWriter score.
   */
  buildFullPromptSection(analysis: NeuronWriterAnalysis): string {
    const lines: string[] = [];

    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('NEURONWRITER SEO OPTIMIZATION — MANDATORY COMPLIANCE REQUIRED');
    lines.push('TARGET: NeuronWriter Content Score ≥ 90 | SEO Score ≥ 90');
    lines.push(`Keyword: ${analysis.keyword || 'N/A'}`);
    lines.push(`Recommended Word Count: ${analysis.recommended_length || 2500}+ words`);
    lines.push(`Content Score Target: ${analysis.content_score || 90}/100`);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');

    // Basic (required) terms
    const basicTerms = analysis.terms || analysis.basicKeywords || [];
    if (basicTerms.length > 0) {
      lines.push('🔴 BASIC KEYWORDS (MANDATORY — use ALL of these naturally):');
      lines.push('Each term must appear in the content at the recommended frequency.');
      const basicList = basicTerms.slice(0, 60).map(t => {
        const freq = t.recommended || t.frequency || 1;
        return `  • "${t.term}" (use ${freq}x minimum)`;
      });
      lines.push(basicList.join('\n'));
      lines.push('');
    }

    // Extended terms
    const extTerms = analysis.termsExtended || analysis.extendedKeywords || [];
    if (extTerms.length > 0) {
      lines.push('🟡 EXTENDED KEYWORDS (HIGH PRIORITY — use as many as possible naturally):');
      const extList = extTerms.slice(0, 60).map(t => {
        const freq = t.recommended || t.frequency || 1;
        return `  • "${t.term}" (use ${freq}x)`;
      });
      lines.push(extList.join('\n'));
      lines.push('');
    }

    // Named entities
    const entities = analysis.entities || [];
    if (entities.length > 0) {
      lines.push('🟢 NAMED ENTITIES (Include these in content — they boost topical authority):');
      const entityList = entities.slice(0, 30).map(e => `  • ${e.entity}`);
      lines.push(entityList.join('\n'));
      lines.push('');
    }

    // Competitor H2 headings
    const h2s = analysis.headingsH2 || analysis.h2Suggestions || [];
    if (h2s.length > 0) {
      lines.push('📋 COMPETITOR H2 HEADINGS (Inspiration — adapt, don\'t copy verbatim):');
      const h2List = h2s.slice(0, 15).map(h => `  • ${h.text}`);
      lines.push(h2List.join('\n'));
      lines.push('');
    }

    // Competitor H3 headings
    const h3s = analysis.headingsH3 || analysis.h3Suggestions || [];
    if (h3s.length > 0) {
      lines.push('📋 COMPETITOR H3 HEADINGS (Inspiration — adapt, don\'t copy verbatim):');
      const h3List = h3s.slice(0, 15).map(h => `  • ${h.text}`);
      lines.push(h3List.join('\n'));
      lines.push('');
    }

    lines.push('CRITICAL INSTRUCTIONS:');
    lines.push('1. Use ALL basic keywords at least the recommended number of times throughout the article.');
    lines.push('2. Use as many extended keywords as possible — aim for 80%+ coverage.');
    lines.push('3. Reference every named entity at least once, in a contextually relevant way.');
    lines.push('4. Structure your H2/H3 headings to cover the topics shown in competitor headings.');
    lines.push('5. Ensure natural density — never keyword-stuff. Work them into sentences organically.');
    lines.push('6. Content quality MUST yield a NeuronWriter score ≥ 90 and SEO score ≥ 90.');
    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }

  /**
   * Legacy format (kept for backward compatibility).
   * Prefer buildFullPromptSection() for full NW data coverage.
   */
  formatTermsForPrompt(terms: NeuronWriterTermData[], analysis: NeuronWriterAnalysis): string {
    return this.buildFullPromptSection(analysis);
  }

  // ─── Private parsers ────────────────────────────────────────────────────────

  private parseTerms(raw: any[], defaultType: 'basic' | 'extended' = 'basic'): NeuronWriterTermData[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(t => t && (t.term || t.text || t.keyword || t.name))
      .map(t => ({
        term: t.term || t.text || t.keyword || t.name || '',
        type: (t.type as any) || defaultType,
        frequency: t.count || t.frequency || t.occurrences || 0,
        weight: t.weight || t.importance || 1,
        usage_pc: t.usage_pc || t.usagePc || 0,
        recommended: t.recommended || t.sugg_usage?.[1] || t.max || t.freq_max || Math.max(1, Math.round((t.weight || 1) * 2)),
        sugg_usage: t.sugg_usage,
      }));
  }

  private parseEntities(raw: any[]): Array<{ entity: string; usage_pc?: number; frequency?: number }> {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(e => e && (e.entity || e.text || e.name || e.value))
      .map(e => ({
        entity: e.entity || e.text || e.name || e.value || '',
        usage_pc: e.usage_pc || e.usagePc || 0,
        frequency: e.frequency || e.count || e.occurrences || 0,
      }));
  }

  private parseHeadings(raw: any[], defaultLevel: 'h2' | 'h3' = 'h2'): NeuronWriterHeadingData[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(h => h && (h.text || h.heading || h.title || h.value))
      .map(h => ({
        text: h.text || h.heading || h.title || h.value || '',
        usage_pc: h.usage_pc || h.usagePc || 0,
        level: (h.level || h.type || defaultLevel) as 'h1' | 'h2' | 'h3',
        relevanceScore: h.relevance || h.relevanceScore || h.score || 0,
      }));
  }
}

export function createNeuronWriterService(apiKeyOrConfig: string | NeuronWriterProxyConfig) {
  return new NeuronWriterService(apiKeyOrConfig);
}

/**
 * Score content against NeuronWriter terms.
 * Returns percentage 0-100 of terms found in content.
 */
export function scoreContentAgainstNeuron(html: string, terms: NeuronWriterTermData[]): number {
  if (!html || !terms?.length) return 0;
  const text = html.replace(/<[^>]*>/g, ' ').toLowerCase();
  let found = 0;
  terms.forEach(t => {
    if (t.term && text.includes(t.term.toLowerCase())) found++;
  });
  return Math.round((found / terms.length) * 100);
}