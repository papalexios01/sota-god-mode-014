// src/lib/sota/NeuronWriterService.ts
// ═══════════════════════════════════════════════════════════════════════════════
// NEURONWRITER SERVICE v7.4 — ENTERPRISE RESILIENCE & AUTO-HEALING ENGINE
// FIXED: createNeuronWriterService now falls back to reading the Supabase URL
//        from the 'wp-optimizer-storage' local storage state if env vars are missing.
//        This prevents HTTP 405 errors when Cloudflare Pages attempts to route
//        a relative POST request to the local static assets.
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
  type: 'required' | 'recommended' | 'optional';
  frequency: number;
  weight: number;
  usage_pc?: number;
  recommended?: number;
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
const PERSISTENT_CACHE_KEY = 'sota-nw-dedup-cache-v7.4';

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
  if (Date.now() - entry.timestamp > 7 * 24 * 60 * 60 * 1000) return undefined;
  return entry.query;
}

export class NeuronWriterService {
  private config: NeuronWriterProxyConfig;

  constructor(configOrApiKey: NeuronWriterProxyConfig | string) {
    // Support both object config and legacy string (API key only) usage
    if (typeof configOrApiKey === 'string') {
      let supabaseUrl = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_URL ?? '') : '';
      let supabaseAnonKey = typeof import.meta !== 'undefined' ? (import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '') : '';

      // Fallback: Attempt to load from the Zustand persisted store
      if (typeof localStorage !== 'undefined') {
        try {
          const stored = localStorage.getItem('wp-optimizer-storage');
          if (stored) {
            const parsed = JSON.parse(stored);
            const stateConfig = parsed?.state?.config;
            if (stateConfig?.supabaseUrl) supabaseUrl = stateConfig.supabaseUrl;
            if (stateConfig?.supabaseAnonKey) supabaseAnonKey = stateConfig.supabaseAnonKey;
          }
        } catch (e) {
          // Ignore parse errors
        }
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

  private async callProxy(endpoint: string, payload: any): Promise<NWApiResponse> {
    let lastError = '';
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url = this.config.customProxyUrl || `${this.config.supabaseUrl}/functions/v1/neuronwriter-proxy`;

        // Build headers — always include X-NW-Endpoint and, when available, X-NW-Api-Key
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.supabaseAnonKey}`,
          'X-NW-Endpoint': endpoint,
        };

        if (this.config.neuronWriterApiKey) {
          headers['X-NW-Api-Key'] = this.config.neuronWriterApiKey;
        }

        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const result = await response.json();
        return { success: true, data: result };
      } catch (err: any) {
        lastError = err.message;
        if (attempt < MAX_RETRIES - 1) await this.sleep(INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt));
      }
    }
    return { success: false, error: lastError };
  }

  private normalize(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  }

  async listProjects(): Promise<{ success: boolean; projects?: NeuronWriterProject[]; error?: string }> {
    this.diag('Fetching projects list...');
    const res = await this.callProxy('list-projects', {});
    if (!res.success) return res;
    return { success: true, projects: res.data?.projects || res.data || [] };
  }

  async findQueryByKeyword(projectId: string, keyword: string): Promise<{ success: boolean; query?: NeuronWriterQuery; error?: string }> {
    const norm = this.normalize(keyword);
    const sessionHit = SESSION_DEDUP_MAP.get(norm);
    if (sessionHit) return { success: true, query: sessionHit };
    
    const persistentHit = findInPersistentCache(norm);
    if (persistentHit) return { success: true, query: persistentHit };

    this.diag(`Searching project ${projectId} for "${keyword}"...`);
    const res = await this.callProxy('list-queries', { project: projectId });
    if (!res.success) return res;

    const list = Array.isArray(res.data) ? res.data : (res.data?.queries || []);
    for (const q of list) {
      const qNorm = this.normalize(q.keyword || '');
      if (levenshteinSimilarity(qNorm, norm) > 0.9) {
        const mapped = { id: q.query || q.id, keyword: q.keyword, status: q.status };
        SESSION_DEDUP_MAP.set(norm, mapped);
        saveToPersistentCache(norm, mapped);
        return { success: true, query: mapped };
      }
    }
    return { success: true, query: undefined };
  }

  async getQueryAnalysis(queryId: string): Promise<{ success: boolean; analysis?: NeuronWriterAnalysis; error?: string }> {
    this.diag(`Fetching analysis ${queryId}...`);
    const res = await this.callProxy('get-query', { query: queryId });
    if (!res.success) return res;

    const data = res.data?.data || res.data;
    const analysis: NeuronWriterAnalysis = {
      query_id: queryId,
      status: data.status || 'ready',
      keyword: data.keyword,
      content_score: data.content_score || data.score || 0,
      recommended_length: data.recommended_length || data.recommendedLength || 2000,
      terms: this.parseTerms(data.terms || data.terms_basic || []),
      termsExtended: this.parseTerms(data.terms_extended || data.extended_terms || []),
      entities: this.parseEntities(data.entities || []),
      headingsH2: this.parseHeadings(data.headings_h2 || data.h2_suggestions || []),
      headingsH3: this.parseHeadings(data.headings_h3 || data.h3_suggestions || []),
      competitorData: data.competitors || data.competitor_data || []
    };
    return { success: true, analysis };
  }

  formatTermsForPrompt(terms: NeuronWriterTermData[], analysis: NeuronWriterAnalysis): string {
    if (!terms?.length) return 'No specific terms provided.';
    const formatted = terms.slice(0, 40).map(t => `${t.term} (count: ${t.frequency}, target: ${t.recommended})`).join(', ');
    return `NEURONWRITER SOTA SEMANTIC CONTEXT:\nTarget Score: ${analysis.content_score || 0}/100\nRecommended Length: ${analysis.recommended_length || 0} words\nKey Terms to Integrate: ${formatted}`;
  }

  private parseTerms(raw: any[]): NeuronWriterTermData[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(t => ({
      term: t.term || t.text || '',
      type: t.type || 'recommended',
      frequency: t.count || t.frequency || 0,
      weight: t.weight || 1,
      usage_pc: t.usage_pc || 0,
      recommended: t.recommended || t.max || 0
    }));
  }

  private parseEntities(raw: any[]): any[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(e => ({
      entity: e.entity || e.text || '',
      usage_pc: e.usage_pc || 0,
      frequency: e.frequency || e.count || 0
    }));
  }

  private parseHeadings(raw: any[]): NeuronWriterHeadingData[] {
    if (!Array.isArray(raw)) return [];
    return raw.map(h => ({
      text: h.text || h.heading || '',
      usage_pc: h.usage_pc || 0,
      level: h.level || 'h2',
      relevanceScore: h.relevance || 0
    }));
  }
}

/**
 * Factory — accepts either a plain API key string OR a full NeuronWriterProxyConfig object.
 *
 * FIX v7.4: Now safely recovers supabaseUrl/Key from localStorage if import.meta.env
 * is empty, preventing HTTP 405 errors (which occur when the URL defaults to a local path).
 */
export function createNeuronWriterService(apiKeyOrConfig: string | NeuronWriterProxyConfig): NeuronWriterService {
  return new NeuronWriterService(apiKeyOrConfig);
}

export function scoreContentAgainstNeuron(html: string, terms: NeuronWriterTermData[]): number {
  if (!html || !terms?.length) return 0;
  const text = html.replace(/<[^>]*>/g, ' ').toLowerCase();
  let found = 0;
  terms.forEach(t => {
    if (text.includes(t.term.toLowerCase())) found++;
  });
  return Math.round((found / terms.length) * 100);
}
