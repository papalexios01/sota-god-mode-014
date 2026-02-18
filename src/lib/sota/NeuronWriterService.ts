// src/lib/sota/NeuronWriterService.ts
// ═══════════════════════════════════════════════════════════════════════════════
// NEURONWRITER SERVICE v6.0 — ENTERPRISE-GRADE DEDUPLICATION
// ═══════════════════════════════════════════════════════════════════════════════
//
// v6.0 Changes (on top of v5.1):
//   • NEW: Levenshtein distance-based fuzzy keyword matching — catches typos,
//     plural forms, and word reorderings that Jaccard overlap missed.
//   • NEW: localStorage-backed persistent dedup cache — survives page reloads,
//     preventing duplicates across browser sessions.
//   • NEW: Dual-layer dedup in createQuery() — pre-flight scan of ALL cached
//     entries using fuzzy matching before ANY API call.
//   • IMPROVED: findQueryByKeyword threshold — uses Levenshtein-based scoring
//     with 90%+ similarity threshold for more aggressive duplicate detection.
//   • IMPROVED: Similarity scoring now considers word-order-independent matching.
//
// v5.1: removeSessionEntry() — orchestrator can clear broken query cache entries.
// v5.0: ROOT CAUSE — accepted ALL statuses, in-memory session guard.
//
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

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
}

export interface NeuronWriterHeadingData {
  text: string;
  usage_pc?: number;
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

export interface NeuronWriterProject {
  id: string;
  name: string;
  language?: string;
  engine?: string;
  queries_count?: number;
  created_at?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;
const PERSISTENT_CACHE_KEY = 'sota-nw-dedup-cache-v6';
const PERSISTENT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─────────────────────────────────────────────────────────────────────────────
// LEVENSHTEIN DISTANCE — for fuzzy keyword deduplication
// ─────────────────────────────────────────────────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  // Use two rows instead of full matrix — O(min(m,n)) space
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // deletion
        curr[j - 1] + 1,  // insertion
        prev[j - 1] + cost // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/**
 * Calculate similarity ratio between two strings using Levenshtein distance.
 * Returns a value between 0 (completely different) and 1 (identical).
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Word-order-independent similarity: sorts words alphabetically then compares.
 * "best dog food" vs "dog food best" → 1.0 (identical when sorted)
 */
function wordOrderIndependentSimilarity(a: string, b: string): number {
  const sortWords = (s: string) => s.split(' ').filter(Boolean).sort().join(' ');
  return levenshteinSimilarity(sortWords(a), sortWords(b));
}

// ─────────────────────────────────────────────────────────────────────────────
// SESSION-LEVEL DEDUP MAP + PERSISTENT CACHE
// ─────────────────────────────────────────────────────────────────────────────

interface SessionEntry {
  queryId: string;
  keyword: string;
  createdAt: Date;
  status: string;
}

interface PersistentCacheEntry {
  queryId: string;
  keyword: string;
  normalizedKeyword: string;
  createdAt: number; // epoch ms
  status: string;
}

const SESSION_DEDUP_MAP = new Map<string, SessionEntry>();

// ── Persistent Cache Helpers ─────────────────────────────────────────────────

function loadPersistentCache(): PersistentCacheEntry[] {
  try {
    const raw = localStorage.getItem(PERSISTENT_CACHE_KEY);
    if (!raw) return [];
    const entries: PersistentCacheEntry[] = JSON.parse(raw);
    const now = Date.now();
    // Prune expired entries
    return entries.filter(e => now - e.createdAt < PERSISTENT_CACHE_MAX_AGE_MS);
  } catch {
    return [];
  }
}

function savePersistentCache(entries: PersistentCacheEntry[]): void {
  try {
    localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage might be full or unavailable — non-fatal
  }
}

function addToPersistentCache(entry: PersistentCacheEntry): void {
  const cache = loadPersistentCache();
  // Remove any existing entry for the same normalized keyword
  const filtered = cache.filter(e => e.normalizedKeyword !== entry.normalizedKeyword);
  filtered.push(entry);
  savePersistentCache(filtered);
}

function findInPersistentCache(normalizedKeyword: string): PersistentCacheEntry | null {
  const cache = loadPersistentCache();

  // 1. Exact match
  const exact = cache.find(e => e.normalizedKeyword === normalizedKeyword);
  if (exact) return exact;

  // 2. Fuzzy match — Levenshtein similarity >= 90%
  let bestMatch: PersistentCacheEntry | null = null;
  let bestSimilarity = 0;

  for (const entry of cache) {
    const directSim = levenshteinSimilarity(entry.normalizedKeyword, normalizedKeyword);
    const wordSim = wordOrderIndependentSimilarity(entry.normalizedKeyword, normalizedKeyword);
    const sim = Math.max(directSim, wordSim);

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

// ─────────────────────────────────────────────────────────────────────────────
// MAIN CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class NeuronWriterService {
  private apiKey: string;
  private proxyConfig: NeuronWriterProxyConfig;

  constructor(apiKey: string, proxyConfig?: NeuronWriterProxyConfig) {
    this.apiKey = apiKey;
    this.proxyConfig = proxyConfig || {};
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DIAGNOSTICS
  // ─────────────────────────────────────────────────────────────────────────

  private diag(msg: string): void {
    const cb = this.proxyConfig.onDiagnostic;
    if (cb) cb(msg);
    else console.log('[NeuronWriter]', msg);
  }

  private diagError(msg: string): void { this.diag('❌ ' + msg); }
  private diagSuccess(msg: string): void { this.diag('✅ ' + msg); }
  private diagWarn(msg: string): void { this.diag('⚠️ ' + msg); }
  private diagInfo(msg: string): void { this.diag('ℹ️ ' + msg); }

  // ─────────────────────────────────────────────────────────────────────────
  // KEYWORD CLEANING
  // ─────────────────────────────────────────────────────────────────────────

  static cleanKeyword(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[-_]+/g, ' ')
      .replace(/\b\d{4}\b/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalize(s: string): string {
    return NeuronWriterService.cleanKeyword(s);
  }

  private getSessionKey(keyword: string): string {
    return this.normalize(keyword);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROXY CALL
  // ─────────────────────────────────────────────────────────────────────────

  private async callProxy(
    endpoint: string,
    body?: Record<string, unknown>,
    retryCount: number = 0
  ): Promise<NWApiResponse> {
    const errors: string[] = [];

    const proxyEndpoints: Array<{
      url: string;
      label: string;
      headers?: Record<string, string>;
    }> = [];

    if (this.proxyConfig.customProxyUrl) {
      proxyEndpoints.push({ url: this.proxyConfig.customProxyUrl, label: 'custom proxy' });
    }
    proxyEndpoints.push({ url: '/api/neuronwriter-proxy', label: 'Express proxy' });
    proxyEndpoints.push({ url: '/api/neuronwriter', label: 'serverless proxy' });

    if (this.proxyConfig.supabaseUrl) {
      const supabaseBase = this.proxyConfig.supabaseUrl.replace(/\/$/, '');
      proxyEndpoints.push({
        url: supabaseBase + '/functions/v1/neuronwriter-proxy',
        label: 'Supabase edge function',
        headers: this.proxyConfig.supabaseAnonKey
          ? {
            Authorization: 'Bearer ' + this.proxyConfig.supabaseAnonKey,
            apikey: this.proxyConfig.supabaseAnonKey,
          }
          : undefined,
      });
    }

    for (const proxy of proxyEndpoints) {
      try {
        this.diagInfo('Trying ' + proxy.label + ': POST ' + proxy.url + ' (action: ' + endpoint + ')');

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-NeuronWriter-Key': this.apiKey,
          ...(proxy.headers || {}),
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        let res: Response;
        try {
          res = await fetch(proxy.url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ endpoint, apiKey: this.apiKey, body: body || {} }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
          const msg = proxy.label + ': returned HTML — endpoint not found';
          errors.push(msg);
          this.diagError(msg);
          continue;
        }

        let data: any;
        try { data = await res.json(); }
        catch {
          const msg = proxy.label + ': response was not valid JSON (status ' + res.status + ')';
          errors.push(msg);
          this.diagError(msg);
          continue;
        }

        if (data && typeof data === 'object') {
          if (data.success === false) {
            const nwError =
              data.error || data.data?.message || data.data?.error ||
              'NeuronWriter API error (status ' + (data.status || res.status) + ')';
            this.diagWarn(proxy.label + ': ' + nwError);
            if (data.status === 401 || data.status === 403) {
              return { success: false, error: 'NeuronWriter auth failed (' + data.status + '). Check API key.', status: data.status };
            }
            if (data.status >= 400 && data.status < 500) {
              return { success: false, error: nwError, status: data.status, data: data.data };
            }
            errors.push(proxy.label + ': ' + nwError);
            continue;
          }
          this.diagSuccess(proxy.label + ': SUCCESS');
          if (data.success !== undefined) return data as NWApiResponse;
          return { success: res.ok, data, status: res.status };
        }

        errors.push(proxy.label + ': unexpected response format');
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        if (errMsg.includes('abort') || errMsg.includes('timeout')) {
          errors.push(proxy.label + ': timeout (15s)');
          this.diagError(proxy.label + ': timeout');
        } else if (errMsg.includes('Failed to fetch')) {
          errors.push(proxy.label + ': network error');
          this.diagError(proxy.label + ': network error');
        } else {
          errors.push(proxy.label + ': ' + errMsg);
          this.diagError(proxy.label + ': ' + errMsg);
        }
      }
    }

    if (retryCount < MAX_RETRIES) {
      const hasTransient = errors.some(
        (e) => e.includes('timeout') || e.includes('network') || e.includes('500') || e.includes('503')
      );
      if (hasTransient) {
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        this.diagWarn('Retrying in ' + delayMs + 'ms... (attempt ' + (retryCount + 1) + '/' + MAX_RETRIES + ')');
        await this.sleep(delayMs);
        return this.callProxy(endpoint, body, retryCount + 1);
      }
    }

    const summary = errors.join(' → ');
    this.diagError('All connection methods failed: ' + summary);
    return { success: false, error: 'All NeuronWriter proxy endpoints failed. ' + summary };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API: LIST PROJECTS
  // ─────────────────────────────────────────────────────────────────────────

  async listProjects(): Promise<{ success: boolean; projects?: NeuronWriterProject[]; error?: string }> {
    try {
      const res = await this.callProxy('/list-projects', {});
      if (!res.success) return { success: false, error: res.error };
      const rawData = res.data as any;
      let rawList: any[] = [];
      if (Array.isArray(rawData)) rawList = rawData;
      else if (rawData?.projects && Array.isArray(rawData.projects)) rawList = rawData.projects;
      else {
        const arrays = Object.values(rawData || {}).filter(Array.isArray);
        if (arrays.length > 0) rawList = arrays[0] as any[];
      }
      const projects: NeuronWriterProject[] = rawList
        .map((p: any) => ({
          id: p.project || p.id || '',
          name: p.name || p.project || 'Unnamed',
          language: p.language,
          engine: p.engine,
          queries_count: p.queries_count,
          created_at: p.created_at || p.created,
        }))
        .filter((p) => p.id);
      this.diagSuccess('Found ' + projects.length + ' projects');
      return { success: true, projects };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError('listProjects failed: ' + msg);
      return { success: false, error: msg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API: FIND QUERY BY KEYWORD
  // ─────────────────────────────────────────────────────────────────────────

  async findQueryByKeyword(
    projectId: string,
    keyword: string
  ): Promise<{ success: boolean; query?: NeuronWriterQuery; error?: string }> {
    try {
      const sessionKey = this.getSessionKey(keyword);

      // ── Layer 1: In-memory session cache (fastest) ──────────────────────
      const sessionHit = SESSION_DEDUP_MAP.get(sessionKey);
      if (sessionHit) {
        this.diagSuccess(
          'SESSION CACHE HIT: keyword "' + keyword + '" → queryId=' + sessionHit.queryId +
          ' (status=' + sessionHit.status + ') — skipping API call'
        );
        return {
          success: true,
          query: {
            id: sessionHit.queryId,
            keyword: sessionHit.keyword,
            status: sessionHit.status,
          },
        };
      }

      // ── Layer 1b: Fuzzy session cache scan ──────────────────────────────
      // Check ALL session entries for Levenshtein-similar keywords
      const searchNorm = this.normalize(keyword);
      for (const [cachedKey, cachedEntry] of SESSION_DEDUP_MAP.entries()) {
        const directSim = levenshteinSimilarity(cachedKey, searchNorm);
        const wordSim = wordOrderIndependentSimilarity(cachedKey, searchNorm);
        const sim = Math.max(directSim, wordSim);

        if (sim >= 0.88) {
          this.diagSuccess(
            'SESSION FUZZY HIT: "' + keyword + '" ≈ "' + cachedEntry.keyword +
            '" (similarity=' + (sim * 100).toFixed(1) + '%) → queryId=' + cachedEntry.queryId
          );
          // Also cache under the new key for instant hits next time
          SESSION_DEDUP_MAP.set(sessionKey, cachedEntry);
          return {
            success: true,
            query: {
              id: cachedEntry.queryId,
              keyword: cachedEntry.keyword,
              status: cachedEntry.status,
            },
          };
        }
      }

      // ── Layer 2: Persistent localStorage cache ──────────────────────────
      const persistentHit = findInPersistentCache(searchNorm);
      if (persistentHit) {
        this.diagSuccess(
          'PERSISTENT CACHE HIT: keyword "' + keyword + '" ≈ "' + persistentHit.keyword +
          '" → queryId=' + persistentHit.queryId + ' — skipping API call'
        );
        // Promote to session cache
        SESSION_DEDUP_MAP.set(sessionKey, {
          queryId: persistentHit.queryId,
          keyword: persistentHit.keyword,
          createdAt: new Date(persistentHit.createdAt),
          status: persistentHit.status,
        });
        return {
          success: true,
          query: {
            id: persistentHit.queryId,
            keyword: persistentHit.keyword,
            status: persistentHit.status,
          },
        };
      }

      // ── Layer 3: API call to list all queries ───────────────────────────
      const res = await this.callProxy('/list-queries', { project: projectId });
      if (!res.success) return { success: false, error: res.error };

      const rawData = res.data as any;
      let rawList: any[] = [];
      if (Array.isArray(rawData)) rawList = rawData;
      else if (rawData?.queries && Array.isArray(rawData.queries)) rawList = rawData.queries;
      else {
        const arrays = Object.values(rawData || {}).filter(Array.isArray);
        if (arrays.length > 0) rawList = arrays[0] as any[];
      }

      this.diagInfo(
        'Searching ' + rawList.length + ' queries for "' + keyword +
        '" (normalized: "' + searchNorm + '") — ALL statuses accepted — using Levenshtein matching'
      );

      let bestMatch: { raw: any; score: number; similarity: number } | null = null;

      for (const q of rawList) {
        const qKeyword = (q.keyword || '').trim();
        if (!qKeyword) continue;

        const qNorm = this.normalize(qKeyword);
        let score = 0;
        let sim = 0;

        if (qNorm === searchNorm) {
          score = 100;
          sim = 1;
        } else {
          // Levenshtein-based similarity (both direct and word-order-independent)
          const directSim = levenshteinSimilarity(qNorm, searchNorm);
          const wordSim = wordOrderIndependentSimilarity(qNorm, searchNorm);
          sim = Math.max(directSim, wordSim);

          // Substring containment bonus
          if (qNorm.includes(searchNorm) || searchNorm.includes(qNorm)) {
            sim = Math.max(sim, 0.85);
          }

          // Convert similarity to score — anything above 85% similarity is a match
          if (sim >= 0.85) {
            score = Math.round(sim * 100);
          }
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { raw: q, score, similarity: sim };
        }
      }

      if (bestMatch) {
        const q = bestMatch.raw;
        const queryId = q.query || q.id || '';
        const status = (q.status || 'unknown').toLowerCase();

        this.diagSuccess(
          'FOUND existing query "' + q.keyword + '" ID=' + queryId +
          ' status=' + status + ' (match score=' + bestMatch.score +
          ', Levenshtein similarity=' + (bestMatch.similarity * 100).toFixed(1) + '%)'
        );

        // Cache in both session and persistent layers
        SESSION_DEDUP_MAP.set(sessionKey, {
          queryId,
          keyword: q.keyword,
          createdAt: new Date(),
          status,
        });

        addToPersistentCache({
          queryId,
          keyword: q.keyword,
          normalizedKeyword: searchNorm,
          createdAt: Date.now(),
          status,
        });

        const mapped: NeuronWriterQuery = {
          id: queryId,
          keyword: q.keyword,
          status,
          language: q.language,
          engine: q.engine,
          source: q.source,
          tags: Array.isArray(q.tags) ? q.tags : [],
          created_at: q.created_at || q.created,
          updated_at: q.updated_at || q.updated,
        };
        return { success: true, query: mapped };
      }

      this.diagInfo('No existing query found for "' + keyword + '" among ' + rawList.length + ' queries');
      return { success: true, query: undefined };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError('findQueryByKeyword failed: ' + msg);
      return { success: false, error: msg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API: CREATE QUERY
  // ─────────────────────────────────────────────────────────────────────────

  async createQuery(
    projectId: string,
    keyword: string
  ): Promise<{ success: boolean; queryId?: string; error?: string }> {
    try {
      const cleanKw = NeuronWriterService.cleanKeyword(keyword);
      const sessionKey = this.getSessionKey(keyword);

      // ── Guard 1: Exact session cache hit ────────────────────────────────
      const sessionHit = SESSION_DEDUP_MAP.get(sessionKey);
      if (sessionHit) {
        this.diagWarn(
          'createQuery BLOCKED by session cache (exact): "' + cleanKw +
          '" → returning existing queryId=' + sessionHit.queryId
        );
        return { success: true, queryId: sessionHit.queryId };
      }

      // ── Guard 2: Fuzzy session cache scan ───────────────────────────────
      // Pre-flight check: scan ALL cached entries for similar keywords
      for (const [cachedKey, cachedEntry] of SESSION_DEDUP_MAP.entries()) {
        const directSim = levenshteinSimilarity(cachedKey, sessionKey);
        const wordSim = wordOrderIndependentSimilarity(cachedKey, sessionKey);
        const sim = Math.max(directSim, wordSim);

        if (sim >= 0.88) {
          this.diagWarn(
            'createQuery BLOCKED by session cache (fuzzy): "' + cleanKw +
            '" ≈ "' + cachedEntry.keyword + '" (similarity=' + (sim * 100).toFixed(1) +
            '%) → returning existing queryId=' + cachedEntry.queryId
          );
          // Cache under the new key too
          SESSION_DEDUP_MAP.set(sessionKey, cachedEntry);
          return { success: true, queryId: cachedEntry.queryId };
        }
      }

      // ── Guard 3: Persistent localStorage cache ──────────────────────────
      const persistentHit = findInPersistentCache(sessionKey);
      if (persistentHit) {
        this.diagWarn(
          'createQuery BLOCKED by persistent cache: "' + cleanKw +
          '" ≈ "' + persistentHit.keyword + '" → returning existing queryId=' + persistentHit.queryId
        );
        SESSION_DEDUP_MAP.set(sessionKey, {
          queryId: persistentHit.queryId,
          keyword: persistentHit.keyword,
          createdAt: new Date(persistentHit.createdAt),
          status: persistentHit.status,
        });
        return { success: true, queryId: persistentHit.queryId };
      }

      // ── All guards passed — create the query ────────────────────────────
      this.diagInfo('Creating NEW query for "' + cleanKw + '" (original: "' + keyword + '") — passed all 3 dedup guards');

      const res = await this.callProxy('/new-query', {
        project: projectId,
        keyword: cleanKw,
        language: 'English',
        engine: 'google.com',
      });

      if (!res.success) return { success: false, error: res.error };

      const data = res.data as any;
      const queryId = data?.query || data?.query_id || data?.id;
      if (!queryId) {
        this.diagError('No query ID returned: ' + JSON.stringify(data).substring(0, 300));
        return { success: false, error: 'No query ID returned from NeuronWriter' };
      }

      this.diagSuccess('Created NEW query ID=' + queryId + ' for "' + cleanKw + '" — cached in session + persistent');

      // Cache in both layers
      SESSION_DEDUP_MAP.set(sessionKey, {
        queryId,
        keyword: cleanKw,
        createdAt: new Date(),
        status: 'in_progress',
      });

      addToPersistentCache({
        queryId,
        keyword: cleanKw,
        normalizedKeyword: sessionKey,
        createdAt: Date.now(),
        status: 'in_progress',
      });

      return { success: true, queryId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError('createQuery failed: ' + msg);
      return { success: false, error: msg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API: GET QUERY ANALYSIS
  // ─────────────────────────────────────────────────────────────────────────

  async getQueryAnalysis(queryId: string): Promise<{
    success: boolean;
    analysis?: NeuronWriterAnalysis;
    error?: string;
  }> {
    try {
      const res = await this.callProxy('/get-query', { query: queryId });
      if (!res.success) return { success: false, error: res.error };

      const data = res.data as any;
      const status = (data.status || '').toLowerCase();

      // ✅ DIAGNOSTIC: Log the RAW response to find where terms actually are
      console.log('[NeuronWriter] RAW /get-query response keys:', Object.keys(data || {}));
      console.log('[NeuronWriter] RAW response status:', data?.status);
      console.log('[NeuronWriter] RAW terms field:', data?.terms ? `${data.terms.length} items` : 'MISSING');
      console.log('[NeuronWriter] RAW basicKeywords:', data?.basicKeywords ? `${data.basicKeywords.length} items` : 'MISSING');
      console.log('[NeuronWriter] RAW recommendations:', data?.recommendations ? Object.keys(data.recommendations) : 'MISSING');
      console.log('[NeuronWriter] RAW content_ideas:', data?.content_ideas ? 'PRESENT' : 'MISSING');
      console.log('[NeuronWriter] RAW data sample:', JSON.stringify(data).substring(0, 500));

      const parsedTerms = this.parseTerms(data.terms || data.basicKeywords || data?.recommendations?.terms || []);
      const parsedTermsExtended = this.parseTerms(data.termsExtended || data.extendedKeywords || data?.recommendations?.termsExtended || []);

      const analysis: NeuronWriterAnalysis = {
        query_id: queryId,
        status: data.status || 'ready',
        keyword: data.keyword,
        content_score: data.content_score || data.contentScore,
        recommended_length: data.recommended_length || data.recommendedLength || 2500,
        terms: parsedTerms,
        termsExtended: parsedTermsExtended,
        basicKeywords: parsedTerms,
        extendedKeywords: parsedTermsExtended,
        entities: this.parseEntities(data.entities || []),
        headingsH2: this.parseHeadings(data.headingsH2 || data.headings_h2 || []),
        headingsH3: this.parseHeadings(data.headingsH3 || data.headings_h3 || []),
      };

      if (!analysis.terms?.length && !analysis.headingsH2?.length) {
        const isProcessing =
          status === 'in_progress' || status === 'pending' || status === 'processing' ||
          status === 'queued' || status === '';
        if (isProcessing) {
          this.diagInfo('Query ' + queryId + ' status="' + (data.status || 'unknown') + '" — not ready yet, will retry.');
          return { success: false, error: 'Query not ready: status="' + (data.status || 'unknown') + '"' };
        }
        this.diagWarn('Query ' + queryId + ' is ready but has no terms. Proceeding anyway.');
      }

      return { success: true, analysis };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError('getQueryAnalysis failed: ' + msg);
      return { success: false, error: msg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API: EVALUATE CONTENT
  // ─────────────────────────────────────────────────────────────────────────

  async evaluateContent(
    queryId: string,
    content: { html: string; title?: string }
  ): Promise<{ success: boolean; contentScore?: number; error?: string }> {
    try {
      const res = await this.callProxy('/set-content', {
        query: queryId,
        content: content.html,
        title: content.title || '',
      });
      if (!res.success) return { success: false, error: res.error };
      const score = (res.data as any)?.content_score || (res.data as any)?.contentScore;
      if (typeof score !== 'number') return { success: false, error: 'No content score returned' };
      this.diagSuccess('Content score: ' + score + '%');
      return { success: true, contentScore: score };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError('evaluateContent failed: ' + msg);
      return { success: false, error: msg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PARSE HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private parseTerms(terms: any[]): NeuronWriterTermData[] {
    if (!Array.isArray(terms)) return [];
    return terms
      .map((t) => {
        if (typeof t === 'string') return { term: t, type: 'recommended' as const, frequency: 1, weight: 50, usage_pc: 50 };
        return {
          term: t.term || t.keyword || String(t),
          type: (t.type || 'recommended') as 'required' | 'recommended' | 'optional',
          frequency: t.frequency || t.count || 1,
          weight: t.weight || t.score || 50,
          usage_pc: t.usage_pc || t.usage || t.percent || 50,
        };
      })
      .filter((t) => t.term && t.term.length > 0);
  }

  private parseEntities(entities: any[]): Array<{ entity: string; usage_pc?: number; frequency?: number }> {
    if (!Array.isArray(entities)) return [];
    return entities
      .map((e) => {
        if (typeof e === 'string') return { entity: e, usage_pc: 50, frequency: 1 };
        return { entity: e.entity || e.name || String(e), usage_pc: e.usage_pc || 50, frequency: e.frequency || 1 };
      })
      .filter((e) => e.entity && e.entity.length > 0);
  }

  private parseHeadings(headings: any[]): NeuronWriterHeadingData[] {
    if (!Array.isArray(headings)) return [];
    return headings
      .map((h) => {
        if (typeof h === 'string') return { text: h, usage_pc: 50 };
        return { text: h.text || h.heading || h.title || String(h), usage_pc: h.usage_pc || 50 };
      })
      .filter((h) => h.text && h.text.length > 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OPTIMIZATION HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  calculateContentScore(html: string, terms: Array<{ term: string }>): number {
    if (!html || !terms || terms.length === 0) return 0;
    const text = html.toLowerCase();
    let matched = 0;
    for (const t of terms) {
      const term = (t.term || '').toLowerCase().trim();
      if (term && text.includes(term)) matched++;
    }
    return Math.min(100, Math.round((matched / terms.length) * 100));
  }

  formatTermsForPrompt(
    terms: Array<{ term: string; type?: string; usage_pc?: number }>,
    analysis: NeuronWriterAnalysis
  ): string {
    const basicTerms = terms
      .filter((t) => t.type === 'required' || t.type === 'recommended')
      .slice(0, 40);
    const extendedTerms = (analysis.termsExtended || []).slice(0, 30);
    const entities = (analysis.entities || []).slice(0, 20);
    const h2Headings = (analysis.headingsH2 || []).slice(0, 10);
    const h3Headings = (analysis.headingsH3 || []).slice(0, 10);

    const sections: string[] = [];
    sections.push('<neuronwriter_optimization>');
    sections.push('<query_id>' + (analysis.query_id || 'unknown') + '</query_id>');
    sections.push('<content_score>' + (analysis.content_score || 0) + '%</content_score>');
    sections.push('<recommended_length>' + (analysis.recommended_length || 2500) + ' words</recommended_length>');

    if (basicTerms.length > 0) {
      sections.push('<basic_keywords priority="HIGHEST">');
      sections.push('These core SEO terms MUST appear naturally in the content:');
      basicTerms.forEach((t, i) => {
        sections.push('  ' + (i + 1) + '. "' + t.term + '" (used by ' + (t.usage_pc || 50) + '% of competitors)');
      });
      sections.push('</basic_keywords>');
    }

    if (extendedTerms.length > 0) {
      sections.push('<extended_keywords priority="HIGH">');
      extendedTerms.forEach((t, i) => {
        sections.push('  ' + (i + 1) + '. "' + t.term + '"');
      });
      sections.push('</extended_keywords>');
    }

    if (entities.length > 0) {
      sections.push('<entities priority="HIGH">');
      entities.forEach((e, i) => {
        sections.push('  ' + (i + 1) + '. "' + e.entity + '" (mentioned by ' + (e.usage_pc || 50) + '% of competitors)');
      });
      sections.push('</entities>');
    }

    if (h2Headings.length > 0) {
      sections.push('<recommended_h2_headings priority="HIGH">');
      h2Headings.forEach((h, i) => {
        sections.push('  ' + (i + 1) + '. "' + h.text + '"');
      });
      sections.push('</recommended_h2_headings>');
    }

    if (h3Headings.length > 0) {
      sections.push('<recommended_h3_headings priority="MEDIUM">');
      h3Headings.forEach((h, i) => {
        sections.push('  ' + (i + 1) + '. "' + h.text + '"');
      });
      sections.push('</recommended_h3_headings>');
    }

    sections.push(
      '<compliance_rules>\n' +
      'TARGET: NeuronWriter score 90%+\n' +
      '1. ALL basic keywords MUST appear in headings AND body paragraphs\n' +
      '2. ALL extended keywords MUST appear at least once\n' +
      '3. ALL entities MUST be mentioned with context\n' +
      '4. ALL recommended H2 headings MUST be used as H2/H3 tags\n' +
      '5. Distribute terms across sections — never cluster in one paragraph\n' +
      '</compliance_rules>'
    );
    sections.push('</neuronwriter_optimization>');

    return sections.join('\n');
  }

  getOptimizationSuggestions(
    html: string,
    terms: Array<{ term: string; weight?: number }>
  ): string[] {
    if (!html || !terms) return [];
    const text = html.toLowerCase();
    const missing: Array<{ term: string; weight: number }> = [];
    for (const t of terms) {
      const term = (t.term || '').toLowerCase().trim();
      if (term && !text.includes(term)) missing.push({ term, weight: t.weight || 50 });
    }
    missing.sort((a, b) => b.weight - a.weight);
    return missing.map((m) => m.term).slice(0, 50);
  }

  getAnalysisSummary(analysis: NeuronWriterAnalysis): string {
    const parts: string[] = [];
    if (analysis.terms?.length) parts.push(analysis.terms.length + ' basic keywords');
    if (analysis.termsExtended?.length) parts.push(analysis.termsExtended.length + ' extended keywords');
    if (analysis.entities?.length) parts.push(analysis.entities.length + ' entities');
    if (analysis.headingsH2?.length) parts.push(analysis.headingsH2.length + ' H2 headings');
    if (analysis.headingsH3?.length) parts.push(analysis.headingsH3.length + ' H3 headings');
    return parts.join(', ') || 'Analysis ready';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SESSION CACHE UTILS
  // ─────────────────────────────────────────────────────────────────────────

  static getSessionCacheSize(): number {
    return SESSION_DEDUP_MAP.size;
  }

  static clearSessionCache(): void {
    SESSION_DEDUP_MAP.clear();
    console.log('[NeuronWriter] Session dedup cache cleared');
  }

  static getSessionCacheEntries(): SessionEntry[] {
    return Array.from(SESSION_DEDUP_MAP.values());
  }

  /**
   * v5.1: Remove a SINGLE keyword from the session dedup cache.
   * Called by the orchestrator when it detects a permanently broken query
   * (ready but zero terms) and needs to force-create a genuine replacement.
   * Without this, createQuery() sees the cached broken ID and returns it again.
   */
  static removeSessionEntry(keyword: string): boolean {
    const normalized = NeuronWriterService.cleanKeyword(keyword);
    const deleted = SESSION_DEDUP_MAP.delete(normalized);
    // Also remove from persistent cache
    removeFromPersistentCache(normalized);
    if (deleted) {
      console.log('[NeuronWriter] 🗑️ Removed session + persistent cache entry for "' + normalized + '"');
    }
    return deleted;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE SCORING
// ─────────────────────────────────────────────────────────────────────────────

export interface NeuronWriterLiveScore {
  score: number;
  basicCoverage: number;
  extendedCoverage: number;
  entityCoverage: number;
  headingCoverage: number;
  missingBasicTerms: string[];
  missingEntities: string[];
  missingHeadings: string[];
  totalTerms: number;
  matchedTerms: number;
}

export function scoreContentAgainstNeuron(
  html: string,
  analysis: NeuronWriterAnalysis
): NeuronWriterLiveScore {
  if (!html || !analysis) {
    return {
      score: 0, basicCoverage: 0, extendedCoverage: 0, entityCoverage: 0,
      headingCoverage: 0, missingBasicTerms: [], missingEntities: [],
      missingHeadings: [], totalTerms: 0, matchedTerms: 0
    };
  }

  const text = html.toLowerCase();

  const basicTerms = analysis.basicKeywords || analysis.terms || [];
  let basicMatched = 0;
  const missingBasicTerms: string[] = [];
  for (const t of basicTerms) {
    const term = (t.term || '').toLowerCase().trim();
    if (!term) continue;
    if (text.includes(term)) basicMatched++;
    else missingBasicTerms.push(t.term);
  }
  const basicCoverage = basicTerms.length > 0 ? Math.round((basicMatched / basicTerms.length) * 100) : 100;

  const extTerms = analysis.extendedKeywords || analysis.termsExtended || [];
  let extMatched = 0;
  for (const t of extTerms) {
    const term = (t.term || '').toLowerCase().trim();
    if (term && text.includes(term)) extMatched++;
  }
  const extendedCoverage = extTerms.length > 0 ? Math.round((extMatched / extTerms.length) * 100) : 100;

  const entities = analysis.entities || [];
  let entityMatched = 0;
  const missingEntities: string[] = [];
  for (const e of entities) {
    const entity = (e.entity || '').toLowerCase().trim();
    if (!entity) continue;
    if (text.includes(entity)) entityMatched++;
    else missingEntities.push(e.entity);
  }
  const entityCoverage = entities.length > 0 ? Math.round((entityMatched / entities.length) * 100) : 100;

  const h2 = analysis.headingsH2 || [];
  let headingMatched = 0;
  const missingHeadings: string[] = [];
  for (const h of h2) {
    const headingText = (h.text || '').toLowerCase().trim();
    if (!headingText) continue;
    if (text.includes(headingText.slice(0, 25))) headingMatched++;
    else missingHeadings.push(h.text);
  }
  const headingCoverage = h2.length > 0 ? Math.round((headingMatched / h2.length) * 100) : 100;

  const totalTerms = basicTerms.length + extTerms.length + entities.length + h2.length;
  const matchedTerms = basicMatched + extMatched + entityMatched + headingMatched;

  const score = Math.min(100, Math.round(
    basicCoverage * 0.5 + extendedCoverage * 0.2 + entityCoverage * 0.15 + headingCoverage * 0.15
  ));

  return {
    score, basicCoverage, extendedCoverage, entityCoverage, headingCoverage,
    missingBasicTerms: missingBasicTerms.slice(0, 30),
    missingEntities: missingEntities.slice(0, 20),
    missingHeadings: missingHeadings.slice(0, 10),
    totalTerms, matchedTerms,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

export function createNeuronWriterService(
  apiKey: string,
  proxyConfig?: NeuronWriterProxyConfig
): NeuronWriterService {
  return new NeuronWriterService(apiKey, proxyConfig);
}

export default NeuronWriterService;
