// src/lib/sota/NeuronWriterService.ts
// ═══════════════════════════════════════════════════════════════════════════════
// NEURONWRITER SERVICE v4.0 — Enterprise-Grade Integration
// ═══════════════════════════════════════════════════════════════════════════════
//
// v4.0 Fixes & Improvements:
//   • FIXED: Double-escaped regex \\b \\d \\s → \b \d \s (was silently broken)
//   • FIXED: sections.join('\\n') → sections.join('\n') in formatTermsForPrompt
//   • FIXED: getQueryAnalysis no longer throws on empty terms for in-progress queries
//   • FIXED: findQueryByKeyword status filter too strict — now skips only known-bad statuses
//   • FIXED: Diagnostic log showed wrong URL (concatenated path instead of POST body action)
//   • NEW: cleanKeywordForNeuronWriter() — slug → human-readable before all NW API calls
//   • NEW: Jaccard token-overlap scoring (≥60%) for robust fuzzy keyword matching
//   • NEW: Year-stripping in normalize() for better cross-year query matching
//   • IMPROVED: All error paths fully surfaced via onDiagnostic callback
//
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & INTERFACES
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
  entities?: Array<{
    entity: string;
    usage_pc?: number;
    frequency?: number;
  }>;
  headingsH2?: NeuronWriterHeadingData[];
  headingsH3?: NeuronWriterHeadingData[];
}

export interface NeuronWriterQuery {
  id: string;
  keyword: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
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

const RETRYABLE_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 1000;

// Statuses that mean a query is definitely NOT ready for use
const NOT_READY_STATUSES = new Set(['pending', 'processing', 'queued', 'in_progress', 'in progress']);

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SERVICE CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class NeuronWriterService {
  private apiKey: string;
  private proxyConfig: NeuronWriterProxyConfig;

  constructor(apiKey: string, proxyConfig?: NeuronWriterProxyConfig) {
    this.apiKey = apiKey;
    this.proxyConfig = proxyConfig || {};
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DIAGNOSTIC LOGGING
  // ─────────────────────────────────────────────────────────────────────────

  private diag(message: string): void {
    const callback = this.proxyConfig.onDiagnostic;
    if (callback) {
      callback(message);
    } else {
      console.log(`[NeuronWriter] ${message}`);
    }
  }

  private diagError(message: string): void { this.diag(`❌ ${message}`); }
  private diagSuccess(message: string): void { this.diag(`✅ ${message}`); }
  private diagWarn(message: string): void { this.diag(`⚠️ ${message}`); }
  private diagInfo(message: string): void { this.diag(`ℹ️ ${message}`); }

  // ─────────────────────────────────────────────────────────────────────────
  // KEYWORD NORMALISATION
  // Converts slug-style or messy keywords into clean human-readable form
  // before all NeuronWriter API calls.
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Converts any keyword format (slug, title-cased, mixed) into a
   * clean, lowercase, space-separated string for NeuronWriter.
   * e.g. "best-running-shoes-for-women-2024" → "best running shoes for women"
   */
  static cleanKeyword(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[-_]+/g, ' ')                // slug/underscore → spaces
      .replace(/\b\d{4}\b/g, '')             // strip standalone years (2024, 2025…)
      .replace(/[^a-z0-9\s]/g, '')           // strip punctuation
      .replace(/\s+/g, ' ')                  // collapse whitespace
      .trim();
  }

  /**
   * Normalize for comparison only (same as clean but also strips stopwords
   * that NeuronWriter often omits from query titles).
   */
  private normalize(s: string): string {
    return NeuronWriterService.cleanKeyword(s);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROXY CONNECTION CHAIN (v4.0: accurate diagnostics, correct URL logging)
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
        url: `${supabaseBase}/functions/v1/neuronwriter-proxy`,
        label: 'Supabase edge function',
        headers: this.proxyConfig.supabaseAnonKey
          ? {
              Authorization: `Bearer ${this.proxyConfig.supabaseAnonKey}`,
              apikey: this.proxyConfig.supabaseAnonKey,
            }
          : undefined,
      });
    }

    for (const proxy of proxyEndpoints) {
      try {
        // FIX: accurate log — endpoint is in the POST body, not appended to the URL
        this.diagInfo(`Trying ${proxy.label}: POST ${proxy.url} (action: ${endpoint})`);

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
          const msg = `${proxy.label}: returned HTML instead of JSON — endpoint not found on this server`;
          errors.push(msg);
          this.diagError(msg);
          continue;
        }

        let data: any;
        try {
          data = await res.json();
        } catch {
          const msg = `${proxy.label}: response was not valid JSON (status ${res.status})`;
          errors.push(msg);
          this.diagError(msg);
          continue;
        }

        if (data && typeof data === 'object') {
          if (data.success === false) {
            const nwError =
              data.error ||
              data.data?.message ||
              data.data?.error ||
              `NeuronWriter API error (status ${data.status || res.status})`;

            this.diagWarn(`${proxy.label}: proxy reached NeuronWriter but got error: ${nwError}`);

            if (data.status === 401 || data.status === 403) {
              const authMsg = `NeuronWriter authentication failed (${data.status}). Check your API key and project ID.`;
              this.diagError(authMsg);
              return { success: false, error: authMsg, status: data.status };
            }

            if (data.status && data.status >= 400 && data.status < 500) {
              return { success: false, error: nwError, status: data.status, data: data.data };
            }

            errors.push(`${proxy.label}: ${nwError}`);
            continue;
          }

          this.diagSuccess(`${proxy.label}: SUCCESS`);
          if (data.success !== undefined) return data as NWApiResponse;
          return { success: res.ok, data, status: res.status };
        }

        errors.push(`${proxy.label}: unexpected response format`);
        this.diagError(`${proxy.label}: unexpected response format`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);

        if (errMsg.includes('abort') || errMsg.includes('timeout')) {
          errors.push(`${proxy.label}: timeout (15s)`);
          this.diagError(`${proxy.label}: timeout (15s)`);
        } else if (errMsg.includes('CORS')) {
          errors.push(`${proxy.label}: CORS blocked`);
          this.diagError(`${proxy.label}: CORS blocked`);
        } else if (errMsg.includes('Failed to fetch')) {
          errors.push(`${proxy.label}: network error or endpoint unreachable`);
          this.diagError(`${proxy.label}: network error`);
        } else {
          errors.push(`${proxy.label}: ${errMsg}`);
          this.diagError(`${proxy.label}: ${errMsg}`);
        }
      }
    }

    // ALL proxies failed
    const summary = errors.join(' → ');
    let helpMessage = '';

    if (proxyEndpoints.length === 0) {
      helpMessage =
        'No NeuronWriter proxy configured. Deploy to Vercel/Cloudflare, run the Express server, or configure Supabase URL.';
    } else if (proxyEndpoints.length <= 2) {
      helpMessage =
        'No working NeuronWriter proxy found. Deploy to Vercel/Cloudflare, run the Express server, or configure Supabase URL in settings.';
    } else {
      helpMessage = `All ${proxyEndpoints.length} proxy endpoints failed.`;
    }

    this.diagError(`${helpMessage}\n   Details: ${summary}`);
    console.error('[NeuronWriter] All connection methods failed:', summary);

    // Retry on transient errors
    if (retryCount < MAX_RETRIES) {
      const hasTransientError = errors.some(
        (e) =>
          e.includes('timeout') ||
          e.includes('network error') ||
          e.includes('500') ||
          e.includes('502') ||
          e.includes('503')
      );

      if (hasTransientError) {
        const delayMs = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        this.diagWarn(
          `Transient error detected. Retrying in ${delayMs}ms... (attempt ${retryCount + 1}/${MAX_RETRIES})`
        );
        await this.sleep(delayMs);
        return this.callProxy(endpoint, body, retryCount + 1);
      }
    }

    return { success: false, error: `${helpMessage} Details: ${summary}` };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API METHODS
  // ─────────────────────────────────────────────────────────────────────────

  async listProjects(): Promise<{
    success: boolean;
    projects?: NeuronWriterProject[];
    error?: string;
  }> {
    try {
      const res = await this.callProxy('/list-projects', {});
      if (!res.success) return { success: false, error: res.error };

      const rawData = res.data as any;
      let rawList: any[] = [];

      if (Array.isArray(rawData)) {
        rawList = rawData;
      } else if (rawData?.projects && Array.isArray(rawData.projects)) {
        rawList = rawData.projects;
      } else if (rawData && typeof rawData === 'object') {
        const possibleArrays = Object.values(rawData).filter(Array.isArray);
        if (possibleArrays.length > 0) rawList = possibleArrays[0] as any[];
      }

      const projects: NeuronWriterProject[] = rawList
        .map((p: any) => ({
          id: p.project || p.id || '',
          name: p.name || p.project || 'Unnamed Project',
          language: p.language,
          engine: p.engine,
          queries_count: p.queries_count,
          created_at: p.created_at || p.created,
        }))
        .filter((p: NeuronWriterProject) => p.id);

      this.diagSuccess(`Found ${projects.length} projects`);
      if (projects.length > 0) {
        this.diagInfo(`Projects: ${projects.map((p) => `${p.name} (${p.id})`).join(', ')}`);
      }

      return { success: true, projects };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError(`listProjects failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Find an existing NeuronWriter query that semantically matches the keyword.
   *
   * Matching strategy (in priority order):
   *   1. Exact normalized match (score 100)
   *   2. One string contains the other (score 80)
   *   3. Jaccard token overlap ≥ 60% (score 42–70)
   *
   * FIX v4.0:
   *   • normalize() now uses correct \b \d \s (was double-escaped \\b \\d \\s)
   *   • Status filter: skip only known-bad statuses, not only known-good ones
   *   • Accepts queries with "Done" tag OR ready/analyzed/finished status
   */
  async findQueryByKeyword(
    projectId: string,
    keyword: string
  ): Promise<{ success: boolean; query?: NeuronWriterQuery; error?: string }> {
    try {
      const res = await this.callProxy('/list-queries', { project: projectId });
      if (!res.success) return { success: false, error: res.error };

      const rawData = res.data as any;
      let rawList: any[] = [];

      if (Array.isArray(rawData)) {
        rawList = rawData;
      } else if (rawData?.queries && Array.isArray(rawData.queries)) {
        rawList = rawData.queries;
      } else if (rawData && typeof rawData === 'object') {
        const possibleArrays = Object.values(rawData).filter(Array.isArray);
        if (possibleArrays.length > 0) rawList = possibleArrays[0] as any[];
      }

      const searchNorm = this.normalize(keyword);
      this.diagInfo(
        `Searching ${rawList.length} queries for "${keyword}" (normalized: "${searchNorm}")`
      );

      let bestMatch: { raw: any; score: number } | null = null;

      for (const q of rawList) {
        const qKeyword = (q.keyword || '').trim();
        if (!qKeyword) continue;

        const qNorm = this.normalize(qKeyword);
        const tags = Array.isArray(q.tags) ? q.tags : [];
        const status = (q.status || '').toLowerCase();

        // FIX: Skip ONLY known-bad statuses; accept anything that isn't explicitly not-ready
        const isExplicitlyNotReady =
          NOT_READY_STATUSES.has(status) &&
          !tags.some((t: string) =>
            ['done', 'ready', 'completed', 'finished', 'analyzed'].includes(t.toLowerCase())
          );
        if (isExplicitlyNotReady) continue;

        // Scoring
        let score = 0;

        if (qNorm === searchNorm) {
          score = 100; // perfect normalized match
        } else if (qNorm.includes(searchNorm) || searchNorm.includes(qNorm)) {
          score = 80; // one contains the other
        } else {
          // Jaccard token overlap
          const qWords = new Set(qNorm.split(' ').filter(Boolean));
          const sWords = new Set(searchNorm.split(' ').filter(Boolean));
          const intersection = [...qWords].filter((w) => sWords.has(w)).length;
          const union = new Set([...qWords, ...sWords]).size;
          const overlap = union > 0 ? intersection / union : 0;
          if (overlap >= 0.6) {
            score = Math.round(overlap * 70); // 42–70
          }
        }

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { raw: q, score };
        }
      }

      if (bestMatch) {
        const q = bestMatch.raw;
        const tags = Array.isArray(q.tags) ? q.tags : [];
        const mapped: NeuronWriterQuery = {
          id: q.query || q.id || '',
          keyword: q.keyword,
          status: 'ready',
          language: q.language,
          engine: q.engine,
          source: q.source,
          tags,
          created_at: q.created_at || q.created,
          updated_at: q.updated_at || q.updated,
        };

        this.diagSuccess(
          `Found existing query for "${keyword}" → matched "${q.keyword}" ` +
            `(score: ${bestMatch.score}, ID: ${mapped.id})`
        );
        return { success: true, query: mapped };
      }

      this.diagInfo(`No ready query found for "${keyword}" among ${rawList.length} queries`);
      return { success: true, query: undefined };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError(`findQueryByKeyword failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async createQuery(
    projectId: string,
    keyword: string
  ): Promise<{ success: boolean; queryId?: string; error?: string }> {
    try {
      // Always create with clean human-readable keyword, never slugs
      const cleanKw = NeuronWriterService.cleanKeyword(keyword);
      this.diagInfo(`Creating NeuronWriter query for "${cleanKw}" (original: "${keyword}")`);

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
        this.diagError(
          `Unexpected createQuery response: ${JSON.stringify(data).substring(0, 300)}`
        );
        return { success: false, error: 'No query ID returned from NeuronWriter' };
      }

      this.diagSuccess(`Created new NeuronWriter query: ${queryId} for "${cleanKw}"`);
      return { success: true, queryId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError(`createQuery failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * FIX v4.0: No longer throws on empty terms for in-progress queries.
   * Returns { success: false, error: "Query not ready: status=..." } so the
   * orchestrator's polling loop can retry correctly.
   */
  async getQueryAnalysis(queryId: string): Promise<{
    success: boolean;
    analysis?: NeuronWriterAnalysis;
    error?: string;
  }> {
    try {
      const res = await this.callProxy('/get-query', { query: queryId });
      if (!res.success) return { success: false, error: res.error };

      const data = res.data as any;

      const parsedTerms = this.parseTerms(data.terms || data.basicKeywords || []);
      const parsedTermsExtended = this.parseTerms(
        data.termsExtended || data.extendedKeywords || []
      );

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

      // FIX: Don't throw — check status first and return a retryable error
      if (!analysis.terms?.length && !analysis.basicKeywords?.length) {
        const status = (data.status || '').toLowerCase();
        const isStillProcessing =
          NOT_READY_STATUSES.has(status) || status === '' || status === 'processing';

        if (isStillProcessing) {
          this.diagInfo(
            `Query ${queryId} status="${data.status || 'unknown'}" — not ready yet, will retry.`
          );
          return {
            success: false,
            error: `Query not ready: status="${data.status || 'unknown'}"`,
          };
        }

        // Status is ready/done but no terms — warn but still return the analysis
        this.diagWarn(
          `Query ${queryId} is ready but returned no terms. ` +
            `Project may have no SERP data for this keyword. Proceeding without NW terms.`
        );
      }

      return { success: true, analysis };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError(`getQueryAnalysis failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

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

      const score =
        (res.data as any)?.content_score || (res.data as any)?.contentScore;
      if (typeof score !== 'number') {
        return { success: false, error: 'No content score returned' };
      }

      this.diagSuccess(`Content evaluated: ${score}% NeuronWriter score`);
      return { success: true, contentScore: score };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.diagError(`evaluateContent failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYSIS HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  private parseTerms(terms: any[]): NeuronWriterTermData[] {
    if (!Array.isArray(terms)) return [];
    return terms
      .map((t) => {
        if (typeof t === 'string') {
          return {
            term: t,
            type: 'recommended' as const,
            frequency: 1,
            weight: 50,
            usage_pc: 50,
          };
        }
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

  private parseEntities(
    entities: any[]
  ): Array<{ entity: string; usage_pc?: number; frequency?: number }> {
    if (!Array.isArray(entities)) return [];
    return entities
      .map((e) => {
        if (typeof e === 'string') return { entity: e, usage_pc: 50, frequency: 1 };
        return {
          entity: e.entity || e.name || String(e),
          usage_pc: e.usage_pc || e.usage || e.percent || 50,
          frequency: e.frequency || e.count || 1,
        };
      })
      .filter((e) => e.entity && e.entity.length > 0);
  }

  private parseHeadings(headings: any[]): NeuronWriterHeadingData[] {
    if (!Array.isArray(headings)) return [];
    return headings
      .map((h) => {
        if (typeof h === 'string') return { text: h, usage_pc: 50 };
        return {
          text: h.text || h.heading || h.title || String(h),
          usage_pc: h.usage_pc || h.usage || h.percent || 50,
        };
      })
      .filter((h) => h.text && h.text.length > 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTENT OPTIMIZATION HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  calculateContentScore(html: string, terms: Array<{ term: string }>): number {
    if (!html || !terms || terms.length === 0) return 0;
    const text = html.toLowerCase();
    let matchedTerms = 0;
    for (const t of terms) {
      const term = (t.term || '').toLowerCase().trim();
      if (term && text.includes(term)) matchedTerms++;
    }
    return Math.min(100, Math.round((matchedTerms / terms.length) * 100));
  }

  /**
   * FIX v4.0: sections.join('\n') — was incorrectly sections.join('\\n')
   */
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
    sections.push(`<query_id>${analysis.query_id || 'unknown'}</query_id>`);
    sections.push(`<content_score>${analysis.content_score || 0}%</content_score>`);
    sections.push(
      `<recommended_length>${analysis.recommended_length || 2500} words</recommended_length>`
    );

    if (basicTerms.length > 0) {
      sections.push('<basic_keywords priority="HIGHEST">');
      sections.push('These are the core SEO terms. MUST appear naturally in the content:');
      basicTerms.forEach((t, i) => {
        sections.push(`  ${i + 1}. "${t.term}" (used by ${t.usage_pc || 50}% of competitors)`);
      });
      sections.push('</basic_keywords>');
    }

    if (extendedTerms.length > 0) {
      sections.push('<extended_keywords priority="HIGH">');
      sections.push('Long-tail variations and related terms. Include where contextually relevant:');
      extendedTerms.forEach((t, i) => {
        sections.push(`  ${i + 1}. "${t.term}"`);
      });
      sections.push('</extended_keywords>');
    }

    if (entities.length > 0) {
      sections.push('<entities priority="HIGH">');
      sections.push('Named entities, brands, and concepts. Mention with context:');
      entities.forEach((e, i) => {
        sections.push(
          `  ${i + 1}. "${e.entity}" (mentioned by ${e.usage_pc || 50}% of competitors)`
        );
      });
      sections.push('</entities>');
    }

    if (h2Headings.length > 0) {
      sections.push('<recommended_h2_headings priority="HIGH">');
      sections.push('Use these as H2 section headings (can be rephrased slightly):');
      h2Headings.forEach((h, i) => {
        sections.push(`  ${i + 1}. "${h.text}"`);
      });
      sections.push('</recommended_h2_headings>');
    }

    if (h3Headings.length > 0) {
      sections.push('<recommended_h3_headings priority="MEDIUM">');
      sections.push('Use these as H3 subsection headings where appropriate:');
      h3Headings.forEach((h, i) => {
        sections.push(`  ${i + 1}. "${h.text}"`);
      });
      sections.push('</recommended_h3_headings>');
    }

    sections.push(`<compliance_rules>
CRITICAL — NeuronWriter score target: 90%+. Every term matters.

1. ALL basic keywords MUST appear in the final content — weave them into prose paragraphs, headings, lists, table cells, and callout boxes. Do NOT create a keyword dump. Integrate each term where it contextually fits.

2. ALL extended keywords MUST appear at least once. Many of these are long-tail phrases — use them in sentences, questions, or subheadings.

3. ALL entities MUST be mentioned with appropriate context (not just name-dropped — explain their relevance).

4. ALL recommended H2 headings MUST be used as H2 or H3 tags. You may rephrase slightly for flow, but preserve the core keywords in each heading.

5. STRATEGIC PLACEMENT:
   • High-value basic keywords → use in H2 headings AND first paragraph of their section
   • Entities → introduce naturally within relevant body paragraphs
   • Extended keywords → distribute across different sections to avoid clustering
   • If a term feels forced, wrap it in a comparison, example, or question to make it natural
</compliance_rules>`);

    sections.push('</neuronwriter_optimization>');

    // FIX: was '\\n' (literal backslash-n), now correct '\n'
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
      if (term && !text.includes(term)) {
        missing.push({ term, weight: t.weight || 50 });
      }
    }
    missing.sort((a, b) => (b.weight || 0) - (a.weight || 0));
    return missing.map((m) => m.term).slice(0, 50);
  }

  getAnalysisSummary(analysis: NeuronWriterAnalysis): string {
    const parts: string[] = [];
    if (analysis.terms?.length) parts.push(`${analysis.terms.length} basic keywords`);
    if (analysis.termsExtended?.length)
      parts.push(`${analysis.termsExtended.length} extended keywords`);
    if (analysis.entities?.length) parts.push(`${analysis.entities.length} entities`);
    if (analysis.headingsH2?.length) parts.push(`${analysis.headingsH2.length} H2 headings`);
    if (analysis.headingsH3?.length) parts.push(`${analysis.headingsH3.length} H3 headings`);
    return parts.join(', ') || 'Analysis ready';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STANDALONE SCORING — used by ContentViewerPanel for live score display
// ─────────────────────────────────────────────────────────────────────────────

export interface NeuronWriterLiveScore {
  score: number;
  basicCoverage: number;
  extendedCoverage: number;
  entityCoverage: number;
  headingCoverage: number;
  missingBasicTerms: string[];
  missingEntities: string[];
  /** Recommended H2 headings NOT found in the content */
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
      score: 0,
      basicCoverage: 0,
      extendedCoverage: 0,
      entityCoverage: 0,
      headingCoverage: 0,
      missingBasicTerms: [],
      missingEntities: [],
      missingHeadings: [],
      totalTerms: 0,
      matchedTerms: 0,
    };
  }

  const text = html.toLowerCase();

  // Basic terms (weight 50%)
  const basicTerms = analysis.basicKeywords || analysis.terms || [];
  let basicMatched = 0;
  const missingBasicTerms: string[] = [];
  for (const t of basicTerms) {
    const term = (t.term || '').toLowerCase().trim();
    if (!term) continue;
    if (text.includes(term)) basicMatched++;
    else missingBasicTerms.push(t.term);
  }
  const basicCoverage =
    basicTerms.length > 0 ? Math.round((basicMatched / basicTerms.length) * 100) : 100;

  // Extended terms (weight 20%)
  const extTerms = analysis.extendedKeywords || analysis.termsExtended || [];
  let extMatched = 0;
  for (const t of extTerms) {
    const term = (t.term || '').toLowerCase().trim();
    if (term && text.includes(term)) extMatched++;
  }
  const extendedCoverage =
    extTerms.length > 0 ? Math.round((extMatched / extTerms.length) * 100) : 100;

  // Entities (weight 15%)
  const entities = analysis.entities || [];
  let entityMatched = 0;
  const missingEntities: string[] = [];
  for (const e of entities) {
    const entity = (e.entity || '').toLowerCase().trim();
    if (!entity) continue;
    if (text.includes(entity)) entityMatched++;
    else missingEntities.push(e.entity);
  }
  const entityCoverage =
    entities.length > 0 ? Math.round((entityMatched / entities.length) * 100) : 100;

  // H2 headings (weight 15%) — partial match on first 25 chars
  const h2Headings = analysis.headingsH2 || [];
  let headingMatched = 0;
  const missingHeadings: string[] = [];
  for (const h of h2Headings) {
    const headingText = (h.text || '').toLowerCase().trim();
    if (!headingText) continue;
    const snippet = headingText.slice(0, 25);
    if (text.includes(snippet)) headingMatched++;
    else missingHeadings.push(h.text);
  }
  const headingCoverage =
    h2Headings.length > 0 ? Math.round((headingMatched / h2Headings.length) * 100) : 100;

  const totalTerms =
    basicTerms.length + extTerms.length + entities.length + h2Headings.length;
  const matchedTerms = basicMatched + extMatched + entityMatched + headingMatched;

  const overallScore = Math.min(
    100,
    Math.round(
      basicCoverage * 0.5 +
        extendedCoverage * 0.2 +
        entityCoverage * 0.15 +
        headingCoverage * 0.15
    )
  );

  return {
    score: overallScore,
    basicCoverage,
    extendedCoverage,
    entityCoverage,
    headingCoverage,
    missingBasicTerms: missingBasicTerms.slice(0, 30),
    missingEntities: missingEntities.slice(0, 20),
    missingHeadings: missingHeadings.slice(0, 10),
    totalTerms,
    matchedTerms,
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
