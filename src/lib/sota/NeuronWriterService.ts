// src/lib/sota/NeuronWriterService.ts
// ═══════════════════════════════════════════════════════════════════════════════
// NEURONWRITER SERVICE v7.1 — SOTA RESILIENT PARSING & AUTO-HEAL
// ═══════════════════════════════════════════════════════════════════════════════

export interface NeuronWriterProxyConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  customProxyUrl?: string;
  onDiagnostic?: (message: string) => void;
}

export interface NWApiResponse {
  success: boolean;
  error?: string;
  status?: number;
  data?: unknown;
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
  h1Suggestions?: any[];
  h2Suggestions?: any[];
  h3Suggestions?: any[];
  recommendations?: any;
  competitorData?: any[];
}

export interface NeuronWriterQuery {
  id: string;
  keyword: string;
  status: string;
  language?: string;
  engine?: string;
  source?: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
}

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const PERSISTENT_CACHE_KEY = 'sota-nw-dedup-cache-v7';
const PERSISTENT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Fuzzy Matching Helpers ─────────────────────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

function wordOrderIndependentSimilarity(a: string, b: string): number {
  const sortWords = (s: string) => s.split(' ').filter(Boolean).sort().join(' ');
  return levenshteinSimilarity(sortWords(a), sortWords(b));
}

// ── Persistent Cache ───────────────────────────────────────────────────────

const SESSION_DEDUP_MAP = new Map();

function loadPersistentCache(): any[] {
  try {
    const raw = localStorage.getItem(PERSISTENT_CACHE_KEY);
    if (!raw) return [];
    const entries: any[] = JSON.parse(raw);
    const now = Date.now();
    return entries.filter(e => now - e.createdAt < PERSISTENT_CACHE_MAX_AGE_MS);
  } catch {
    return [];
  }
}

function savePersistentCache(entries: any[]): void {
  try {
    localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(entries));
  } catch {}
}

function findInPersistentCache(normalizedKeyword: string): any | null {
  const cache = loadPersistentCache();
  const exact = cache.find(e => e.normalizedKeyword === normalizedKeyword);
  if (exact) return exact;

  let bestMatch: any | null = null;
  let bestSimilarity = 0;

  for (const entry of cache) {
    const sim = Math.max(
      levenshteinSimilarity(entry.normalizedKeyword, normalizedKeyword),
      wordOrderIndependentSimilarity(entry.normalizedKeyword, normalizedKeyword)
    );
    if (sim >= 0.90 && sim > bestSimilarity) {
      bestMatch = entry;
      bestSimilarity = sim;
    }
  }
  return bestMatch;
}

function removeFromPersistentCache(normalizedKeyword: string): void {
  const cache = loadPersistentCache();
  savePersistentCache(cache.filter(e => e.normalizedKeyword !== normalizedKeyword));
}

export class NeuronWriterService {
  private apiKey: string;
  private proxyConfig: NeuronWriterProxyConfig;

  constructor(apiKey: string, proxyConfig?: NeuronWriterProxyConfig) {
    this.apiKey = apiKey;
    this.proxyConfig = proxyConfig || {};
  }

  private diag(msg: string): void {
    const cb = this.proxyConfig.onDiagnostic;
    if (cb) cb(msg);
    else console.log('[NeuronWriter]', msg);
  }

  static cleanKeyword(raw: string): string {
    return raw.toLowerCase()
      .replace(/[-\_]+/g, ' ')
      .replace(/\b\d{4}\b/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalize(s: string): string {
    return NeuronWriterService.cleanKeyword(s);
  }

  private async callProxy(endpoint: string, body?: Record<string, any>, retryCount: number = 0): Promise<NWApiResponse> {
    const proxyEndpoints = [];
    if (this.proxyConfig.customProxyUrl) proxyEndpoints.push({ url: this.proxyConfig.customProxyUrl, label: 'custom' });
    proxyEndpoints.push({ url: '/api/neuronwriter-proxy', label: 'Express' });
    proxyEndpoints.push({ url: '/api/neuronwriter', label: 'Serverless' });

    if (this.proxyConfig.supabaseUrl) {
      proxyEndpoints.push({
        url: this.proxyConfig.supabaseUrl.replace(/\/$/, '') + '/functions/v1/neuronwriter-proxy',
        label: 'Supabase',
        headers: {
          Authorization: `Bearer ${this.proxyConfig.supabaseAnonKey}`,
          apikey: this.proxyConfig.supabaseAnonKey
        }
      });
    }

    let lastError = '';
    for (const proxy of proxyEndpoints) {
      try {
        const res = await fetch(proxy.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...proxy.headers },
          body: JSON.stringify({ endpoint, apiKey: this.apiKey, body: body || {} })
        });
        const data = await res.json();
        if (data.success !== false) return data;
        lastError = data.error || 'Unknown error';
      } catch (e) {
        lastError = String(e);
      }
    }

    if (retryCount < MAX_RETRIES) {
      await new Promise(r => setTimeout(r, INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount)));
      return this.callProxy(endpoint, body, retryCount + 1);
    }
    return { success: false, error: lastError };
  }

  async findQueryByKeyword(projectId: string, keyword: string) {
    const norm = this.normalize(keyword);
    const sessionHit = SESSION_DEDUP_MAP.get(norm);
    if (sessionHit) return { success: true, query: sessionHit };

    const persistentHit = findInPersistentCache(norm);
    if (persistentHit) return { success: true, query: persistentHit };

    this.diag(`Searching project ${projectId} for keyword "${keyword}"...`);
    const res = await this.callProxy('/list-queries', { project: projectId });
    if (!res.success) return res;

    const list = Array.isArray(res.data) ? res.data : (res.data as any)?.queries || [];
    for (const q of list) {
      const qNorm = this.normalize(q.keyword || '');
      if (levenshteinSimilarity(qNorm, norm) > 0.9) {
        const mapped = { id: q.query || q.id, keyword: q.keyword, status: q.status };
        SESSION_DEDUP_MAP.set(norm, mapped);
        return { success: true, query: mapped };
      }
    }
    return { success: true, query: undefined };
  }

  async getQueryAnalysis(queryId: string): Promise<{ success: boolean; analysis?: NeuronWriterAnalysis; error?: string }> {
    const res = await this.callProxy('/get-query', { query: queryId });
    if (!res.success) {
      this.diag(`Failed to fetch query ${queryId}: ${res.error}`);
      return res;
    }

    const raw = res.data as any;
    if (!raw) {
      this.diag(`Query ${queryId} returned success but empty data payload.`);
      return { success: false, error: 'Empty data payload' };
    }

    const { basic, extended, entities, h2, h3, recommendations, competitors } = this.normalizePayload(raw);

    const analysis: NeuronWriterAnalysis = {
      query_id: queryId,
      status: raw.status || (raw.data as any)?.status || 'ready',
      keyword: raw.keyword || (raw.data as any)?.keyword,
      content_score: raw.content_score || raw.contentScore || (raw.data as any)?.content_score || 0,
      recommended_length: raw.recommended_length || (raw.data as any)?.recommended_length || 2500,
      terms: this.parseTerms(basic),
      termsExtended: this.parseTerms(extended),
      basicKeywords: this.parseTerms(basic),
      extendedKeywords: this.parseTerms(extended),
      entities: this.parseEntities(entities),
      headingsH2: this.parseHeadings(h2),
      headingsH3: this.parseHeadings(h3),
      recommendations,
      competitorData: competitors
    };

    const hasTerms = (analysis.terms?.length || 0) > 0;
    const hasEntities = (analysis.entities?.length || 0) > 0;
    if (!hasTerms && !hasEntities) {
      this.diag(`WARNING: Analysis ${queryId} found but no terms/entities parsed. Raw keys: ${Object.keys(raw).join(', ')}`);
    }

    return { success: true, analysis };
  }

  private normalizePayload(raw: any) {
    const data = raw?.data ?? raw;
    const rec = data?.recommendations ?? data?.recommendation ?? data?.results?.recommendations ?? {};
    const kw = data?.keywords ?? rec?.keywords ?? data?.results?.keywords ?? {};
    
    const firstArr = (...c: any[]) => c.find(a => Array.isArray(a) && a.length) || [];

    return {
      basic: firstArr(data?.basicKeywords, rec?.basicKeywords, data?.terms, rec?.terms, kw?.basic, rec?.basic, data?.results?.terms_basic),
      extended: firstArr(data?.extendedKeywords, rec?.extendedKeywords, data?.termsExtended, rec?.termsExtended, kw?.extended, rec?.extended, data?.results?.terms_extended),
      entities: firstArr(data?.entities, rec?.entities, data?.result?.entities, data?.results?.entities),
      h2: firstArr(data?.headingsH2, rec?.headingsH2, data?.headings?.h2, data?.results?.headings_h2),
      h3: firstArr(data?.headingsH3, rec?.headingsH3, data?.headings?.h3, data?.results?.headings_h3),
      recommendations: rec,
      competitors: firstArr(data?.competitors, data?.competitorData, rec?.competitors, data?.results?.competitors)
    };
  }

  private parseTerms(terms: any[]): NeuronWriterTermData[] {
    if (!Array.isArray(terms)) return [];
    return terms.map(t => ({
      term: t.term || t.keyword || t.name || String(t),
      type: (t.type || 'recommended') as any,
      frequency: t.frequency || t.count || 1,
      weight: t.weight || t.score || 50,
      recommended: t.recommended || t.frequency || 1
    })).filter(t => t.term && t.term.length > 1);
  }

  private parseEntities(entities: any[]) {
    if (!Array.isArray(entities)) return [];
    return entities.map(e => ({
      entity: e.entity || e.name || e.term || String(e),
      usage_pc: e.usage_pc || 50,
      frequency: e.frequency || 1
    })).filter(e => e.entity);
  }

  private parseHeadings(headings: any[]) {
    if (!Array.isArray(headings)) return [];
    return headings.map(h => ({
      text: h.text || h.heading || h.title || String(h),
      usage_pc: h.usage_pc || 50
    })).filter(h => h.text);
  }

  formatTermsForPrompt(terms: NeuronWriterTermData[], analysis: NeuronWriterAnalysis): string {
    const sections = [
      `NEURONWRITER ANALYSIS [ID: ${analysis.query_id}]`,
      `Target Score: 90%+ | Rec Length: ${analysis.recommended_length} words`,
      ' CORE SEO TERMS (MUST USE):',
      ...terms.slice(0, 50).map((t, i) => ` ${i+1}. "${t.term}" (target: ${t.recommended}x)`),
      ' ENTITIES:',
      ...(analysis.entities || []).slice(0, 25).map((e, i) => ` ${i+1}. "${e.entity}"`),
      ' RECOMMENDED HEADINGS:',
      ...(analysis.headingsH2 || []).slice(0, 10).map((h, i) => ` H2: "${h.text}"`),
      ' STRATEGY:',
      '1. Distribute terms naturally across all sections.',
      '2. Use recommended headings as H2/H3 foundations.',
      '3. Ensure entities are mentioned with context.'
    ];
    return sections.join(' ');
  }

  static removeSessionEntry(keyword: string): void {
    const norm = this.cleanKeyword(keyword);
    SESSION_DEDUP_MAP.delete(norm);
    removeFromPersistentCache(norm);
  }
}

export function scoreContentAgainstNeuron(html: string, analysis: NeuronWriterAnalysis) {
  if (!html || !analysis) return null;
  const text = html.toLowerCase().replace(/<[^>]*>/g, ' ');
  const terms = [...(analysis.basicKeywords || []), ...(analysis.extendedKeywords || [])];
  
  const missing: string[] = [];
  const underused: string[] = [];
  const optimal: string[] = [];
  let matched = 0;

  for (const t of terms) {
    const count = (text.match(new RegExp(t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
    if (count === 0) missing.push(t.term);
    else if (count < (t.recommended || 1)) underused.push(t.term);
    else optimal.push(t.term);
    if (count > 0) matched++;
  }

  return {
    score: Math.round((matched / (terms.length || 1)) * 100),
    missing,
    underused,
    optimal
  };
}

export function createNeuronWriterService(apiKey: string, proxyConfig?: NeuronWriterProxyConfig) {
  return new NeuronWriterService(apiKey, proxyConfig);
}

export default NeuronWriterService;
