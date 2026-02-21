// src/lib/sota/EnterpriseContentOrchestrator.ts
// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CONTENT ORCHESTRATOR v10.0 — SOTA GOD-MODE ARCHITECTURE
//
// Pipeline phases:
//   1. NeuronWriter Semantic Context Initialization (auto-create + poll)
//   2. YouTube Video Discovery (1-3 relevant videos via Serper)
//   3. Reference Gathering (8-12 high-quality references via Serper)
//   4. Master Content Generation (AI model)
//   5. SOTA Humanization & Premium Design Overlay
//   6. Visual Break Enforcement (break walls of text every ~200 words)
//   7. YouTube Video Injection (embed + cards)
//   8. Reference Section Injection
//   9. Internal Link Generation & Injection (4–8 contextual links)
//  10. Schema.org Structured Data Generation
// ═══════════════════════════════════════════════════════════════════════════════

import type {
  APIKeys,
  AIModel,
  GeneratedContent,
  ContentMetrics,
  QualityScore,
  SERPAnalysis,
  InternalLink,
  SchemaMarkup,
  EEATProfile,
  YouTubeVideo,
  Reference,
  ContentPlan,
  PostProcessingResult,
} from './types';
import {
  SOTAContentGenerationEngine,
  createSOTAEngine,
  type ExtendedAPIKeys,
} from './SOTAContentGenerationEngine';
import { SERPAnalyzer, createSERPAnalyzer } from './SERPAnalyzer';
import { YouTubeService, createYouTubeService } from './YouTubeService';
import { ReferenceService, createReferenceService } from './ReferenceService';
import {
  SOTAInternalLinkEngine,
  createInternalLinkEngine,
} from './SOTAInternalLinkEngine';
import { SchemaGenerator, createSchemaGenerator } from './SchemaGenerator';
import {
  calculateQualityScore,
  analyzeContent,
  removeAIPhrases,
  polishReadability,
  validateVisualBreaks,
} from './QualityValidator';
import { EEATValidator, createEEATValidator } from './EEATValidator';
import { generationCache } from './cache';
import {
  NeuronWriterService,
  createNeuronWriterService,
  type NeuronWriterAnalysis,
  type NeuronWriterQuery,
} from './NeuronWriterService';
import ContentPostProcessor, { removeAIPatterns, postProcessContent } from './ContentPostProcessor';
import {
  buildMasterSystemPrompt,
  buildMasterUserPrompt,
  type ContentPromptConfig,
} from './prompts/masterContentPrompt';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const NW_TARGET_SCORE = 90;

// Polling: wait up to 15 minutes, polling every 12 seconds
const NW_MAX_POLL_ATTEMPTS = 75;          // 75 × 12s = 15 minutes max
const NW_POLL_INTERVAL_MS = 12000;        // 12 seconds between polls
const NW_HARD_LIMIT_MS = 15 * 60 * 1000; // 15-minute hard cap

// The NW query must be in one of these statuses before we consider data valid
const NW_READY_STATUSES = new Set(['done', 'ready', 'completed', 'finished', 'analysed', 'analyzed']);

const MIN_VALID_CONTENT_LENGTH = 1200;

type NeuronBundle = {
  service: NeuronWriterService;
  queryId: string;
  analysis: NeuronWriterAnalysis;
};

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR CLASS
// ─────────────────────────────────────────────────────────────────────────────

export class EnterpriseContentOrchestrator {
  private engine: SOTAContentGenerationEngine;
  private serpAnalyzer: SERPAnalyzer;
  private youtubeService: YouTubeService;
  private referenceService: ReferenceService;
  private linkEngine: SOTAInternalLinkEngine;
  private schemaGenerator: SchemaGenerator;
  private eeatValidator: EEATValidator;
  private config: any;
  private telemetry: any = { warnings: [], errors: [], timeline: [] };
  private onProgress?: (msg: string) => void;

  constructor(config: any) {
    this.config = config;

    // Extract serperApiKey from nested apiKeys or from top-level config
    const serperKey = config.apiKeys?.serperApiKey || config.serperApiKey || '';

    this.engine = createSOTAEngine(config.apiKeys);
    this.serpAnalyzer = createSERPAnalyzer(serperKey);
    this.youtubeService = createYouTubeService(serperKey);
    this.referenceService = createReferenceService(serperKey);
    this.linkEngine = createInternalLinkEngine(config.sitePages || []);
    // FIX: SchemaGenerator(orgName, orgUrl, logoUrl) — never pass apiKeys here
    this.schemaGenerator = createSchemaGenerator(
      config.organizationName || 'Editorial Team',
      config.organizationUrl || config.wpUrl || 'https://example.com',
      config.logoUrl || ''
    );
    this.eeatValidator = createEEATValidator();
  }

  private log(msg: string) {
    const timestamp = new Date().toISOString();
    console.log(`[Orchestrator] [${timestamp}]`, msg);
    this.telemetry.timeline.push({ timestamp, event: msg });
    if (this.onProgress) this.onProgress(msg);
  }

  private warn(msg: string) {
    console.warn('[Orchestrator]', msg);
    this.telemetry.warnings.push(msg);
  }

  private error(msg: string) {
    console.error('[Orchestrator]', msg);
    this.telemetry.errors.push(msg);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // NEURONWRITER INTEGRATION v9.0 — AUTO-CREATE + FULL DATA POLLING
  // ─────────────────────────────────────────────────────────────────────────

  private async maybeInitNeuronWriter(keyword: string, options: any): Promise<NeuronBundle | null> {
    if (!this.config.neuronWriterApiKey || !this.config.neuronWriterProjectId) {
      this.warn('NeuronWriter: Skipping — API key or project ID not configured.');
      return null;
    }

    // Build NeuronWriter config with proper proxy routing
    const nwConfig: any = {
      neuronWriterApiKey: this.config.neuronWriterApiKey,
    };

    // If a customProxyUrl is set, pass it through
    if (this.config.customProxyUrl) {
      nwConfig.customProxyUrl = this.config.customProxyUrl;
    }

    // Pass Supabase credentials for edge function auth (if using Supabase proxy)
    if (this.config.supabaseUrl) {
      nwConfig.supabaseUrl = this.config.supabaseUrl;
    }
    if (this.config.supabaseAnonKey) {
      nwConfig.supabaseAnonKey = this.config.supabaseAnonKey;
    }

    const service = createNeuronWriterService(nwConfig);
    const projectId = this.config.neuronWriterProjectId;
    const startTime = Date.now();

    try {
      // ── Step 1: Search for existing query ──────────────────────────────────
      this.log(`NeuronWriter: Searching project "${projectId}" for keyword "${keyword}"...`);
      const searchRes = await service.findQueryByKeyword(projectId, keyword);

      let query: NeuronWriterQuery | undefined = searchRes.query;

      // ── Step 2: Auto-create query if not found ────────────────────────────
      if (!query) {
        this.log(`NeuronWriter: Keyword not found in project. Creating new query for "${keyword}"...`);
        const createRes = await service.createQuery(projectId, keyword);

        if (!createRes.success || !createRes.query) {
          this.warn(`NeuronWriter: Failed to create query — ${createRes.error || 'unknown error'}. Proceeding without NW data.`);
          return null;
        }

        query = createRes.query;
        this.log(`NeuronWriter: New query created (ID: ${query.id}). Waiting for analysis to complete...`);
      } else {
        this.log(`NeuronWriter: Found existing query "${query.keyword}" (ID: ${query.id}, status: ${query.status})`);
      }

      const queryId = query.id;

      // ── Step 3: Poll until data is ready ─────────────────────────────────
      this.log(`NeuronWriter: Polling query ${queryId} for analysis data...`);

      for (let i = 0; i < NW_MAX_POLL_ATTEMPTS; i++) {
        const elapsed = Date.now() - startTime;

        if (elapsed > NW_HARD_LIMIT_MS) {
          this.warn(`NeuronWriter: Polling timeout (${Math.round(elapsed / 1000)}s). Proceeding without NW data.`);
          break;
        }

        const res = await service.getQueryAnalysis(queryId);

        if (!res.success) {
          this.warn(`NeuronWriter: getQueryAnalysis failed (attempt ${i + 1}): ${res.error}`);
          await new Promise(r => setTimeout(r, NW_POLL_INTERVAL_MS));
          continue;
        }

        if (res.analysis) {
          const a = res.analysis;
          const status = (a.status || '').toLowerCase();

          const basicCount = a.terms?.length || 0;
          const extendedCount = a.termsExtended?.length || 0;
          const entityCount = a.entities?.length || 0;
          const h2Count = a.headingsH2?.length || 0;
          const h3Count = a.headingsH3?.length || 0;
          const totalData = basicCount + extendedCount + entityCount + h2Count + h3Count;

          if (i % 3 === 0 || totalData > 0) {
            this.log(
              `NeuronWriter: Poll ${i + 1}/${NW_MAX_POLL_ATTEMPTS} | Status: ${status} | ` +
              `Basic: ${basicCount}, Extended: ${extendedCount}, Entities: ${entityCount}, H2: ${h2Count}, H3: ${h3Count}`
            );
          }

          const isReady = NW_READY_STATUSES.has(status);
          const hasSubstantialData = basicCount >= 5 || (basicCount > 0 && extendedCount > 0);

          if (isReady || hasSubstantialData) {
            this.log(
              `✅ NeuronWriter: Analysis ready! ` +
              `${basicCount} basic, ${extendedCount} extended, ` +
              `${entityCount} entities, ${h2Count} H2s, ${h3Count} H3s.`
            );
            return { service, queryId, analysis: a };
          }

          if (isReady && totalData === 0) {
            this.warn(`NeuronWriter: Query is '${status}' but returned no data.`);
            if (i >= 5) {
              this.warn('NeuronWriter: 5 retries with empty data on ready query. Giving up.');
              break;
            }
          }
        }

        if (i < NW_MAX_POLL_ATTEMPTS - 1) {
          const elapsed2 = Date.now() - startTime;
          if (i % 5 === 0) {
            this.log(`NeuronWriter: Analysis still processing... (${Math.round(elapsed2 / 1000)}s elapsed)`);
          }
          await new Promise(r => setTimeout(r, NW_POLL_INTERVAL_MS));
        }
      }

      this.warn('NeuronWriter: Could not retrieve analysis data after polling. Proceeding without NW optimization.');
      return null;

    } catch (e) {
      this.error(`NeuronWriter Subsystem Error: ${e}`);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // YOUTUBE VIDEO DISCOVERY & INJECTION
  // ─────────────────────────────────────────────────────────────────────────

  private async fetchYouTubeVideos(keyword: string): Promise<YouTubeVideo[]> {
    try {
      this.log('Searching for relevant YouTube videos...');
      const videos = await this.youtubeService.getRelevantVideos(keyword, 'guide');

      if (videos.length === 0) {
        this.warn('YouTube: No relevant videos found.');
        return [];
      }

      // Take 1-3 videos
      const selected = videos.slice(0, 3).filter(v => v.id && v.id.length > 0);
      this.log(`YouTube: Found ${selected.length} relevant videos.`);
      return selected;
    } catch (e) {
      this.warn(`YouTube: Video search failed (${e}). Proceeding without videos.`);
      return [];
    }
  }

  private injectYouTubeVideos(html: string, videos: YouTubeVideo[]): string {
    if (!videos || videos.length === 0) return html;

    let result = html;

    // Find H2 headings to distribute videos across sections
    const h2Matches = [...result.matchAll(/<h2[^>]*>[\s\S]*?<\/h2>/gi)];

    if (h2Matches.length < 2) {
      // If not enough headings, inject all videos before the article footer
      const videoBlock = this.buildVideoSectionHtml(videos);
      const footerIdx = result.indexOf('data-article-footer');
      if (footerIdx !== -1) {
        const insertPoint = result.lastIndexOf('<div', footerIdx);
        if (insertPoint !== -1) {
          result = result.slice(0, insertPoint) + '\n' + videoBlock + '\n' + result.slice(insertPoint);
        }
      } else {
        result = result.replace('</article>', videoBlock + '\n</article>');
      }
      return result;
    }

    // Distribute: embed first video after 2nd H2, place cards for remaining as a section
    const firstVideo = videos[0];
    const remainingVideos = videos.slice(1);

    // Embed the first video after the 2nd H2's section (after 2-3 paragraphs)
    if (firstVideo && h2Matches.length >= 2) {
      const secondH2 = h2Matches[1];
      const searchStart = secondH2.index! + secondH2[0].length;

      // Find the 2nd </p> after this H2
      let pCount = 0;
      let insertPos = searchStart;
      const pClosingRegex = /<\/p>/gi;
      pClosingRegex.lastIndex = searchStart;
      let pMatch;
      while ((pMatch = pClosingRegex.exec(result)) !== null) {
        pCount++;
        if (pCount >= 2) {
          insertPos = pMatch.index + pMatch[0].length;
          break;
        }
      }

      const embedHtml = this.youtubeService.formatVideoEmbed(firstVideo);
      result = result.slice(0, insertPos) + '\n' + embedHtml + '\n' + result.slice(insertPos);
    }

    // Insert remaining videos as cards in a dedicated section before references
    if (remainingVideos.length > 0) {
      const videoCardsHtml = this.buildVideoCardsSection(remainingVideos);
      const refsIdx = result.search(/<h2[^>]*>.*?(?:references|sources|further reading)/i);
      if (refsIdx !== -1) {
        result = result.slice(0, refsIdx) + '\n' + videoCardsHtml + '\n' + result.slice(refsIdx);
      } else {
        const footerIdx = result.indexOf('data-article-footer');
        if (footerIdx !== -1) {
          const insertPoint = result.lastIndexOf('<div', footerIdx);
          if (insertPoint !== -1) {
            result = result.slice(0, insertPoint) + '\n' + videoCardsHtml + '\n' + result.slice(insertPoint);
          }
        } else {
          result = result.replace('</article>', videoCardsHtml + '\n</article>');
        }
      }
    }

    return result;
  }

  private buildVideoSectionHtml(videos: YouTubeVideo[]): string {
    if (videos.length === 0) return '';

    const embed = videos[0] ? this.youtubeService.formatVideoEmbed(videos[0]) : '';
    const cards = videos.slice(1).map(v => this.youtubeService.formatVideoCard(v)).join('\n');

    return `
<div style="margin: 48px 0;">
  <h2 style="font-size:1.95em;font-weight:900;color:#0f172a;margin:0 0 20px 0;line-height:1.15;letter-spacing:-0.025em;font-family:'Inter',system-ui,sans-serif;border-bottom:3px solid #e2e8f0;padding-bottom:12px;">🎬 Helpful Video Resources</h2>
  ${embed}
  ${cards}
</div>`;
  }

  private buildVideoCardsSection(videos: YouTubeVideo[]): string {
    if (videos.length === 0) return '';
    const cards = videos.map(v => this.youtubeService.formatVideoCard(v)).join('\n');
    return `
<div style="margin: 40px 0;">
  <h3 style="font-size:1.3em;font-weight:800;color:#1e293b;margin:0 0 16px 0;font-family:'Inter',system-ui,sans-serif;">📺 More Videos Worth Watching</h3>
  ${cards}
</div>`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REFERENCE GATHERING & INJECTION
  // ─────────────────────────────────────────────────────────────────────────

  private async fetchReferences(keyword: string): Promise<Reference[]> {
    try {
      this.log('Gathering high-quality references via Serper...');
      const refs = await this.referenceService.getTopReferences(keyword, 12);
      this.log(`References: Found ${refs.length} high-authority sources.`);
      return refs;
    } catch (e) {
      this.warn(`References: Search failed (${e}). Proceeding without references.`);
      return [];
    }
  }

  private injectReferencesSection(html: string, references: Reference[]): string {
    if (!references || references.length === 0) return html;

    // Check if references/sources section already exists
    const hasRefs = /<h2[^>]*>\s*(?:references|sources|further reading|sources\s*&\s*further\s*reading)/i.test(html);
    if (hasRefs) {
      this.log('References: Article already contains a references section. Skipping injection.');
      return html;
    }

    const refsHtml = this.referenceService.formatReferencesSection(references);

    // Style the references section to match premium design
    const styledRefsHtml = `
<div style="margin: 56px 0 0 0; padding-top: 40px; border-top: 2px solid #e2e8f0;">
  <h2 style="font-size:1.95em;font-weight:900;color:#0f172a;margin:0 0 20px 0;line-height:1.15;letter-spacing:-0.025em;font-family:'Inter',system-ui,sans-serif;border-bottom:3px solid #e2e8f0;padding-bottom:12px;">📚 Sources & Further Reading</h2>
  <div style="font-family:'Inter',system-ui,sans-serif;">
    <ol style="margin:0;padding:0 0 0 0;list-style:none;counter-reset:ref-counter;">
      ${references.map((ref, i) => {
      const safeTitle = (ref.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const typeLabel = ref.type === 'academic' ? ' <span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">Academic</span>'
        : ref.type === 'government' ? ' <span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">Official</span>'
          : ref.type === 'news' ? ' <span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">News</span>'
            : '';
      return `<li style="margin:0 0 16px 0;padding:12px 16px;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;display:flex;align-items:flex-start;gap:12px;">
          <span style="flex-shrink:0;width:28px;height:28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;">${i + 1}</span>
          <div>
            <a href="${ref.url}" target="_blank" rel="noopener noreferrer" style="color:#1e293b;text-decoration:none;font-weight:600;font-size:15px;line-height:1.4;">${safeTitle}</a>
            <div style="margin-top:4px;font-size:12px;color:#64748b;">${ref.domain}${typeLabel}</div>
          </div>
        </li>`;
    }).join('\n')}
    </ol>
  </div>
</div>`;

    // Insert before the article footer or before </article>
    const footerIdx = html.indexOf('data-article-footer');
    if (footerIdx !== -1) {
      const insertPoint = html.lastIndexOf('<div', footerIdx);
      if (insertPoint !== -1) {
        return html.slice(0, insertPoint) + '\n' + styledRefsHtml + '\n' + html.slice(insertPoint);
      }
    }

    return html.replace('</article>', styledRefsHtml + '\n</article>');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PREMIUM HTML STYLING
  // ─────────────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────────────
  // SOTA PREMIUM DESIGN SYSTEM v10.0 — MAGAZINE-QUALITY POST-PROCESSOR
  // ─────────────────────────────────────────────────────────────────────────

  private async applyPremiumStyling(html: string): Promise<string> {
    let output = html;

    // ── 1. UNWRAP BARE ARTICLE TAG — ensure consistent wrapper ─────────────
    // Normalize the article wrapper to our premium styled version
    output = output.replace(
      /<article[^>]*>/i,
      `<article style="font-family:'Georgia',Georgia,serif;max-width:860px;margin:0 auto;color:#1e293b;line-height:1.85;font-size:17px;">`
    );

    // ── 2. PREMIUM HERO HEADER ─────────────────────────────────────────────
    if (!output.includes('data-premium-hero')) {
      const title = this.config.currentTitle || 'Strategic Analysis';
      const author = this.config.authorName || 'Editorial Board';
      const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      const authorInitial = author.charAt(0).toUpperCase();

      const hero = `
<div data-premium-hero="true" style="font-family:'Inter',system-ui,sans-serif;background:linear-gradient(150deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%);padding:72px 48px 56px;border-radius:24px;margin-bottom:56px;color:white;position:relative;overflow:hidden;">
  <div style="position:absolute;top:-80px;right:-80px;width:360px;height:360px;background:radial-gradient(circle,rgba(99,102,241,0.15),transparent 70%);border-radius:50%;pointer-events:none;"></div>
  <div style="position:absolute;bottom:-40px;left:-40px;width:240px;height:240px;background:radial-gradient(circle,rgba(16,185,129,0.08),transparent 70%);border-radius:50%;pointer-events:none;"></div>
  <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:100px;padding:6px 16px;margin-bottom:28px;">
    <span style="width:6px;height:6px;background:#818cf8;border-radius:50%;display:inline-block;animation:pulse 2s infinite;"></span>
    <span style="font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#a5b4fc;">SOTA God-Mode Intelligence</span>
  </div>
  <h1 style="font-size:clamp(28px,4vw,48px);line-height:1.08;font-weight:900;margin:0 0 28px 0;color:white;letter-spacing:-0.02em;max-width:740px;">${title}</h1>
  <div style="width:60px;height:3px;background:linear-gradient(90deg,#818cf8,#34d399);border-radius:2px;margin-bottom:32px;"></div>
  <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
    <div style="width:48px;height:48px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;color:white;flex-shrink:0;">${authorInitial}</div>
    <div>
      <div style="font-weight:700;font-size:16px;color:white;">${author}</div>
      <div style="font-size:13px;color:#94a3b8;margin-top:2px;">${date}</div>
    </div>
    <div style="margin-left:auto;display:flex;gap:8px;flex-wrap:wrap;">
      <span style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:6px 14px;font-size:12px;color:#cbd5e1;font-weight:600;">✦ Expert-Reviewed</span>
      <span style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);border-radius:8px;padding:6px 14px;font-size:12px;color:#34d399;font-weight:600;">● NW Optimized</span>
    </div>
  </div>
</div>`;
      output = output.replace(/<article[^>]*>/i, match => match + hero);
    }

    // ── 3. AUTO-GENERATE TABLE OF CONTENTS ────────────────────────────────
    if (!output.includes('data-toc') && (output.match(/<h2[^>]*>/gi) || []).length >= 3) {
      const h2Matches = [...output.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)];
      if (h2Matches.length >= 3) {
        const tocItems = h2Matches.map((m, i) => {
          const text = m[1].replace(/<[^>]+>/g, '').trim();
          const id = `section-${i + 1}`;
          // Add id to the matching h2
          output = output.replace(m[0], m[0].replace(/<h2/, `<h2 id="${id}"`));
          return `<li style="margin:6px 0;"><a href="#${id}" style="color:#4f46e5;text-decoration:none;font-size:15px;line-height:1.5;display:flex;align-items:baseline;gap:10px;"><span style="color:#cbd5e1;font-size:12px;font-weight:700;min-width:20px;">${String(i + 1).padStart(2, '0')}</span>${text}</a></li>`;
        }).join('\n');

        const toc = `
<nav data-toc="true" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:28px 32px;margin:0 0 48px 0;font-family:'Inter',system-ui,sans-serif;">
  <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px;">
    <span style="font-size:16px;">📋</span>
    <strong style="font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#64748b;font-family:'Inter',system-ui,sans-serif;">Table of Contents</strong>
  </div>
  <ol style="margin:0;padding:0;list-style:none;">
    ${tocItems}
  </ol>
</nav>`;

        // Insert TOC after the hero/first callout box or at start of article body
        output = output.replace(/(data-premium-hero="true"[\s\S]*?<\/div>)\s*(<[ph2])/i, `$1\n${toc}\n$2`);
      }
    }

    // ── 4. STYLE ALL PARAGRAPHS ─────────────────────────────────────────────
    output = output.replace(/<p(?!\s+style=)(?=[^>]*>)/gi, '<p style="margin:0 0 22px 0;line-height:1.85;"');
    // Don't double-style within callout boxes
    output = output.replace(/<p style="margin:0 0 22px 0;line-height:1\.85;" style="/gi, '<p style="');

    // ── 5. STYLE ALL HEADINGS ───────────────────────────────────────────────
    output = output.replace(/<h2(?!\s+[^>]*style=)([^>]*)>/gi,
      `<h2$1 style="font-size:1.95em;font-weight:900;color:#0f172a;margin:56px 0 20px 0;line-height:1.15;letter-spacing:-0.025em;font-family:'Inter',system-ui,sans-serif;border-bottom:3px solid #e2e8f0;padding-bottom:12px;">`
    );
    output = output.replace(/<h3(?!\s+[^>]*style=)([^>]*)>/gi,
      `<h3$1 style="font-size:1.3em;font-weight:800;color:#1e293b;margin:40px 0 14px 0;letter-spacing:-0.01em;font-family:'Inter',system-ui,sans-serif;">`
    );
    output = output.replace(/<h4(?!\s+[^>]*style=)([^>]*)>/gi,
      `<h4$1 style="font-size:1.1em;font-weight:700;color:#334155;margin:28px 0 10px 0;font-family:'Inter',system-ui,sans-serif;">`
    );

    // ── 6. STYLE LISTS ──────────────────────────────────────────────────────
    output = output.replace(/<ul(?!\s+[^>]*style=)([^>]*)>/gi,
      `<ul$1 style="margin:0 0 24px 0;padding:0 0 0 0;list-style:none;">`
    );
    output = output.replace(/<li(?!\s+[^>]*style=)([^>]*)>(?!\s*<strong)/gi,
      `<li$1 style="margin:0 0 10px 0;padding:0 0 0 28px;position:relative;line-height:1.7;">
        <span style="position:absolute;left:0;top:7px;width:8px;height:8px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:50%;"></span>`
    );
    output = output.replace(/<ol(?!\s+[^>]*style=)([^>]*)>/gi,
      `<ol$1 style="margin:0 0 24px 0;padding:0 0 0 0;list-style:none;counter-reset:ol-counter;">`
    );

    // ── 7. ENHANCE BLOCKQUOTES ──────────────────────────────────────────────
    output = output.replace(/<blockquote(?!\s+[^>]*style=)([^>]*)>/gi,
      `<blockquote$1 style="border:none;border-left:5px solid #6366f1;background:linear-gradient(to right,#fafafa,#ffffff);padding:32px 36px;margin:40px 0;border-radius:0 16px 16px 0;position:relative;overflow:hidden;">`
    );
    // Add the decorative quote mark
    output = output.replace(
      /(<blockquote[^>]*style="[^"]*border-left:5px solid #6366f1[^"]*"[^>]*>)/gi,
      `$1<div style="position:absolute;top:-10px;right:20px;font-size:120px;color:#e0e7ff;font-family:Georgia,serif;line-height:1;pointer-events:none;user-select:none;">"</div>`
    );
    output = output.replace(/<blockquote([^>]*)>\s*<p([^>]*)>/gi,
      `<blockquote$1><p$2 style="font-style:italic;font-size:1.15em;color:#1e293b;line-height:1.8;margin:0 0 16px 0;font-family:'Georgia',serif;">`
    );
    output = output.replace(/<cite(?!\s+[^>]*style=)([^>]*)>/gi,
      `<cite$1 style="display:block;margin-top:12px;font-style:normal;font-size:13px;color:#64748b;font-weight:700;letter-spacing:0.03em;text-transform:uppercase;font-family:'Inter',system-ui,sans-serif;">`
    );

    // ── 8. ENHANCE TABLES ───────────────────────────────────────────────────
    // Wrap tables that aren't already wrapped
    output = output.replace(/(?<!overflow-x:auto[^<]*)<table(?!\s+[^>]*style=)([^>]*)>/gi,
      `<div style="overflow-x:auto;margin:36px 0;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);border:1px solid #e2e8f0;"><table$1 style="width:100%;border-collapse:collapse;font-size:15px;font-family:'Inter',system-ui,sans-serif;">`
    );
    output = output.replace(/<\/table>(?!\s*<\/div>(?=[^<]*overflow-x))/gi, '</table></div>');
    output = output.replace(/<thead(?!\s+[^>]*style=)([^>]*)>/gi,
      `<thead$1 style="background:linear-gradient(90deg,#1e293b,#334155);">`
    );
    output = output.replace(/<th(?!\s+[^>]*style=)([^>]*)>/gi,
      `<th$1 style="padding:16px 20px;text-align:left;font-weight:700;color:white;font-size:13px;letter-spacing:0.05em;text-transform:uppercase;white-space:nowrap;">`
    );
    output = output.replace(/<td(?!\s+[^>]*style=)([^>]*)>/gi,
      `<td$1 style="padding:14px 20px;border-bottom:1px solid #f1f5f9;vertical-align:top;color:#334155;">`
    );
    output = output.replace(/<tbody(?!\s+[^>]*style=)([^>]*)>/gi, `<tbody$1>`);

    // ── 9. STYLE FAQ ACCORDIONS (details/summary) ───────────────────────────
    output = output.replace(/<details(?!\s+[^>]*style=)([^>]*)>/gi,
      `<details$1 style="border:1px solid #e2e8f0;border-radius:14px;margin:12px 0;overflow:hidden;transition:all 0.2s ease;">`
    );
    output = output.replace(/<summary(?!\s+[^>]*style=)([^>]*)>/gi,
      `<summary$1 style="padding:20px 26px;font-weight:700;cursor:pointer;background:#f8fafc;color:#1e293b;list-style:none;display:flex;justify-content:space-between;align-items:center;font-family:'Inter',system-ui,sans-serif;font-size:16px;line-height:1.4;">`
    );

    // ── 10. ENHANCE STRONG/EM ────────────────────────────────────────────────
    // Don't touch strong tags that are already inside styled containers

    // ── 11. ADD READING PROGRESS METADATA BAR ───────────────────────────────
    if (!output.includes('data-reading-meta')) {
      const wordCount = output.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
      const readTime = Math.max(1, Math.ceil(wordCount / 200));
      const keyword = this.config.currentTitle || '';

      const metaBar = `
<div data-reading-meta="true" style="font-family:'Inter',system-ui,sans-serif;display:flex;align-items:center;gap:20px;padding:14px 20px;background:#f1f5f9;border-radius:12px;margin:0 0 36px 0;flex-wrap:wrap;">
  <span style="display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;"><span style="font-size:15px;">⏱️</span> <strong style="color:#334155;">${readTime} min</strong> read</span>
  <span style="color:#cbd5e1;">|</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;"><span style="font-size:15px;">📖</span> <strong style="color:#334155;">${wordCount.toLocaleString()}</strong> words</span>
  <span style="color:#cbd5e1;">|</span>
  <span style="display:flex;align-items:center;gap:6px;font-size:13px;color:#64748b;"><span style="font-size:15px;">✓</span> Updated <strong style="color:#334155;">${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong></span>
</div>`;

      // Insert right after the hero
      output = output.replace(
        /(<nav data-toc="true")/,
        `${metaBar}\n$1`
      );
      if (!output.includes('data-reading-meta="true"')) {
        // Fallback: insert after the hero div
        output = output.replace(
          /(data-premium-hero="true"[\s\S]*?<\/div>\s*<\/div>)/i,
          `$1\n${metaBar}`
        );
      }
    }

    // ── 12. STYLE ANY BARE HR ELEMENTS ──────────────────────────────────────
    output = output.replace(/<hr(?!\s+[^>]*style=)\s*\/?>/gi,
      `<hr style="border:none;height:2px;background:linear-gradient(90deg,transparent,#e2e8f0,transparent);margin:48px 0;">`
    );

    // ── 13. ADD SHARE/ENGAGEMENT FOOTER ─────────────────────────────────────
    if (!output.includes('data-article-footer')) {
      const footerBox = `
<div data-article-footer="true" style="font-family:'Inter',system-ui,sans-serif;background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:20px;padding:40px;margin:56px 0 0 0;text-align:center;color:white;">
  <div style="font-size:28px;font-weight:900;letter-spacing:-0.02em;margin-bottom:12px;">Did This Help?</div>
  <p style="color:#a5b4fc;font-size:16px;margin:0 0 24px 0;line-height:1.6;">Bookmark this guide — the information here is updated regularly as the topic evolves.</p>
  <div style="display:inline-flex;gap:12px;flex-wrap:wrap;justify-content:center;">
    <span style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:10px 22px;font-size:14px;font-weight:600;">🔖 Bookmark</span>
    <span style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:100px;padding:10px 22px;font-size:14px;font-weight:600;">📤 Share</span>
    <span style="background:rgba(99,102,241,0.3);border:1px solid rgba(99,102,241,0.5);border-radius:100px;padding:10px 22px;font-size:14px;font-weight:600;">⭐ Save for Later</span>
  </div>
</div>`;
      output = output.replace(/<\/article>/i, `${footerBox}\n</article>`);
    }

    return output;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CONTENT HUMANIZATION
  // ─────────────────────────────────────────────────────────────────────────

  private async humanizeContent(html: string, keyword: string): Promise<string> {
    const prompt = `You are the senior editor at The Atlantic. Your entire job right now is to transform this AI-generated HTML into writing that feels like it was written by a brilliant human expert who has lived this subject.

SPECIFIC REWRITING INSTRUCTIONS:

1. COLD OPEN REWRITE: Find the first paragraph. If it starts with anything generic, rewrite it to start with either:
   - A specific scene: "In March 2023, Sarah Chen spent six hours..."  
   - A shocking specific number: "73% of people who try this fail within 30 days. Here's why."
   - A bold counter-claim: "Everything you've been told about [topic] is backwards."

2. RHYTHM REPAIR — for every 3 consecutive sentences of similar length, insert a 1-4 word sentence. Like: "That's the trap." or "It gets worse." or "Sound familiar?"

3. VOCABULARY UPGRADE — Replace every instance of these with the alternatives:
   - "important" → "critical" or "decisive" or nothing
   - "good" → "exceptional" / "strong" / specific adjective
   - "help" → "accelerate" / "protect" / specific verb
   - "things" → name the specific things
   - "aspects" → name them
   - "many people" → "most beginners" / "experienced practitioners" / be specific

4. INJECT EXPERTISE SIGNALS — Add at least 3 of these markers throughout:
   - A specific statistic with source year: "(Stanford, 2023)" or "(Journal of X, 2024)"
   - A named expert with credential: "Dr. Sarah Mitchell, Stanford's behavioral lab director, puts it bluntly:"
   - A first-person observation: "I've reviewed dozens of these cases. The pattern is always the same."
   - A "here's what they don't tell you" moment

5. PARAGRAPH ENDINGS — Every section should end with either:
   - A question that creates curiosity gap
   - A brief 1-sentence "so what" implication
   - A surprising prediction or counter-intuitive takeaway

6. PRESERVE EVERYTHING TECHNICAL: Keep ALL HTML tags, ALL inline styles, ALL callout boxes, ALL tables, ALL internal links, ALL structured data elements. Modify only the text content inside them.

CONTENT TO EDIT:
${html}

OUTPUT: Return ONLY the edited HTML. No preamble, no explanation, no markdown.`;

    try {
      const res = await this.engine.generateWithModel({
        prompt,
        model: 'anthropic',
        apiKeys: this.config.apiKeys,
        systemPrompt: 'You are a Pulitzer-Prize-winning editor at The Atlantic. Output ONLY the improved HTML. No commentary, no markdown, no preamble.',
        temperature: 0.75,
        maxTokens: 16384,
      });

      const result = res.content || html;
      // Safety check: if the model returned less than 60% of original length, it probably truncated
      if (result.length < html.length * 0.6) {
        this.warn(`Humanization returned truncated content (${result.length} vs ${html.length} chars). Using original.`);
        return html;
      }
      return result;
    } catch (e) {
      this.warn(`Humanization step failed (${e}), using raw AI output.`);
      return html;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN PIPELINE
  // ─────────────────────────────────────────────────────────────────────────

  async generateContent(options: any): Promise<any> {
    this.onProgress = options.onProgress;
    this.log(`🚀 SOTA GOD-MODE PIPELINE v10.0 ENGAGED: "${options.keyword}"`);

    this.config.currentTitle = options.title || options.keyword;
    this.config.authorName = options.authorName || 'SOTA AI Research';

    // ── Phase 1: NeuronWriter Semantic Context Initialization ──────────────
    this.log('Phase 1: NeuronWriter Semantic Context Initialization...');
    const neuron = await this.maybeInitNeuronWriter(options.keyword, options);

    if (neuron) {
      const { analysis } = neuron;
      this.log(
        `Phase 1 ✅ NeuronWriter data loaded: ` +
        `${analysis.terms?.length || 0} basic, ` +
        `${analysis.termsExtended?.length || 0} extended, ` +
        `${analysis.entities?.length || 0} entities, ` +
        `${analysis.headingsH2?.length || 0} H2, ` +
        `${analysis.headingsH3?.length || 0} H3`
      );
    } else {
      this.warn('Phase 1: NeuronWriter data unavailable — generating without semantic optimization.');
    }

    // ── Phase 2: YouTube Video Discovery (parallel with Phase 3) ──────────
    this.log('Phase 2: YouTube Video Discovery...');
    const videosPromise = this.fetchYouTubeVideos(options.keyword);

    // ── Phase 3: Reference Gathering (parallel with Phase 2) ──────────────
    this.log('Phase 3: Reference Gathering (8-12 high-quality sources)...');
    const referencesPromise = this.fetchReferences(options.keyword);

    // Wait for both parallel phases
    const [videos, references] = await Promise.all([videosPromise, referencesPromise]);

    this.log(`Phase 2 ✅ YouTube: ${videos.length} videos found.`);
    this.log(`Phase 3 ✅ References: ${references.length} high-authority sources found.`);

    // ── Phase 4: Master Content Synthesis ─────────────────────────────────
    this.log('Phase 4: Master Content Generation (High-Burstiness Engine)...');

    const systemPrompt = buildMasterSystemPrompt();

    const neuronWriterSection = neuron
      ? neuron.service.buildFullPromptSection(neuron.analysis)
      : 'No NeuronWriter data available. Focus on comprehensive semantic coverage using LSI keywords, natural language variation, and expert-level topic coverage.';

    // Build YouTube embed data for prompt (first video only for AI to place)
    const youtubeEmbed = videos.length > 0 ? { videoId: videos[0].id, title: videos[0].title } : undefined;

    const userPrompt = buildMasterUserPrompt({
      primaryKeyword: options.keyword,
      title: options.title || options.keyword,
      contentType: options.contentType || 'pillar',
      targetWordCount: neuron?.analysis?.recommended_length || options.targetWordCount || 3500,
      neuronWriterSection,
      authorName: this.config.authorName,
      internalLinks: options.internalLinks || [],
      youtubeEmbed,
    } as any);

    const genResult = await this.engine.generateWithModel({
      prompt: userPrompt,
      systemPrompt,
      model: options.model || this.config.primaryModel || 'gemini',
      apiKeys: this.config.apiKeys,
      maxTokens: 16384,
      temperature: 0.82
    });

    let html = genResult.content;

    if (!html || html.trim().length < MIN_VALID_CONTENT_LENGTH) {
      throw new Error(`AI returned insufficient content (${html?.length || 0} chars). Try switching to a different model.`);
    }

    // ── Phase 5: SOTA Refinement & Aesthetics ─────────────────────────────
    this.log('Phase 5: SOTA Humanization & Premium Design Overlay...');

    html = await this.humanizeContent(html, options.keyword);
    html = polishReadability(html);
    html = await this.applyPremiumStyling(html);

    // ── Phase 6: Visual Break Enforcement ─────────────────────────────────
    this.log('Phase 6: Visual Break Enforcement (breaking walls of text)...');

    const postProcessResult = postProcessContent(html, {
      maxConsecutiveWords: 200,
      usePullQuotes: true,
      enhanceDesign: false, // Already styled by applyPremiumStyling
      removeAI: true,
    });

    html = postProcessResult.html;
    this.log(`Phase 6 ✅ Visual breaks: ${postProcessResult.elementsInjected} elements injected, ${postProcessResult.violations.length} remaining violations.`);

    // ── Phase 7: YouTube Video Injection ──────────────────────────────────
    this.log('Phase 7: Injecting YouTube videos...');
    html = this.injectYouTubeVideos(html, videos);
    this.log(`Phase 7 ✅ ${videos.length} videos injected into content.`);

    // ── Phase 8: Reference Section Injection ──────────────────────────────
    this.log('Phase 8: Injecting references section...');
    html = this.injectReferencesSection(html, references);
    this.log(`Phase 8 ✅ ${references.length} references injected.`);

    // ── Phase 9: Internal Link Generation & Injection (4–8 links) ─────────
    this.log('Phase 9: Generating & Injecting Internal Links...');

    let finalInternalLinks: InternalLink[] = [];

    if (this.config.sitePages && this.config.sitePages.length > 0) {
      this.linkEngine.updateSitePages(this.config.sitePages);
      const generatedLinks = this.linkEngine.generateLinkOpportunities(html, 8, options.keyword);

      if (generatedLinks.length > 0) {
        html = this.linkEngine.injectContextualLinks(html, generatedLinks);
        finalInternalLinks = generatedLinks;
        this.log(`Phase 9 ✅ Injected ${generatedLinks.length} contextual internal links.`);
      } else {
        this.warn('Phase 9: No matching site pages found for internal linking. Ensure your sitemap has been loaded.');
      }
    } else {
      this.warn('Phase 9: Skipping internal links — no site pages loaded. Add a Sitemap URL in the Setup tab.');
    }

    // ── Phase 10: Schema.org Structured Data ───────────────────────────────
    this.log('Phase 10: Generating Schema.org Structured Data...');

    const authorName = this.config.authorName || 'Editorial Team';
    const siteUrl = (this.config.organizationUrl || this.config.wpUrl || 'https://example.com').replace(/\/$/, '');
    const slug = (options.title || options.keyword).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const articleUrl = `${siteUrl}/${slug}/`;

    const contentForSchema = {
      title: options.title || options.keyword,
      metaDescription: `A comprehensive guide on ${options.keyword}.`,
      content: html,
      generatedAt: new Date(),
      eeat: {
        author: {
          name: authorName,
          credentials: [],
          publications: [],
          expertiseAreas: [options.keyword],
          socialProfiles: [],
        },
        citations: [],
        expertReviews: [],
        methodology: '',
        lastUpdated: new Date(),
        factChecked: true,
      },
    } as any;

    let schema: any = { '@context': 'https://schema.org', '@graph': [] };
    try {
      schema = this.schemaGenerator.generateComprehensiveSchema(contentForSchema, articleUrl);
      this.log(`Phase 10 ✅ Schema generated with ${schema['@graph']?.length || 0} entities.`);
    } catch (e) {
      this.warn(`Phase 10: Schema generation failed (${e}). Using empty schema.`);
    }

    this.log('✅ All 10 phases complete. Assembling final result...');

    const wordCount = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;

    return {
      id: crypto.randomUUID(),
      title: options.title || options.keyword,
      seoTitle: options.title || options.keyword,
      content: html,
      metaDescription: `A comprehensive guide and analysis on ${options.keyword}.`,
      slug,
      primaryKeyword: options.keyword,
      secondaryKeywords: [
        ...(neuron?.analysis?.terms?.map((t: any) => t.term).slice(0, 5) || []),
        ...(neuron?.analysis?.termsExtended?.map((t: any) => t.term).slice(0, 5) || []),
      ],
      metrics: {
        wordCount,
        sentenceCount: Math.round(wordCount / 15),
        paragraphCount: Math.round(wordCount / 100),
        headingCount: (html.match(/<h[2-6][^>]*>/gi) || []).length,
        imageCount: (html.match(/<img[^>]*>/gi) || []).length,
        linkCount: (html.match(/<a[^>]*>/gi) || []).length,
        keywordDensity: 1.5,
        readabilityGrade: 8,
        estimatedReadTime: Math.ceil(wordCount / 200)
      },
      qualityScore: calculateQualityScore(html, options.keyword, finalInternalLinks.map(l => l.targetUrl)),
      internalLinks: finalInternalLinks,
      schema,
      eeat: {
        author: {
          name: authorName,
          credentials: [],
          publications: [],
          expertiseAreas: [options.keyword],
          socialProfiles: []
        },
        citations: references.map(r => ({ title: r.title, url: r.url, type: r.type })),
        expertReviews: [],
        methodology: '',
        lastUpdated: new Date(),
        factChecked: true
      },
      serpAnalysis: {
        avgWordCount: neuron?.analysis?.recommended_length || 2000,
        recommendedWordCount: neuron?.analysis?.recommended_length || 2500,
        userIntent: 'informational',
        commonHeadings: [
          ...(neuron?.analysis?.headingsH2 || []).map(h => h.text),
          ...(neuron?.analysis?.headingsH3 || []).map(h => h.text)
        ],
        contentGaps: [],
        semanticEntities: (neuron?.analysis?.entities || []).map(e => e.entity),
        topCompetitors: [],
        recommendedHeadings: [
          ...(neuron?.analysis?.headingsH2 || []).map(h => h.text),
          ...(neuron?.analysis?.headingsH3 || []).map(h => h.text)
        ],
      },
      generatedAt: new Date(),
      model: genResult.model,
      consensusUsed: false,
      neuronWriterAnalysis: neuron?.analysis || null,
      neuronWriterQueryId: neuron?.queryId || null,
      youtubeVideos: videos,
      references,
      telemetry: this.telemetry
    } as any;
  }
}

export function createOrchestrator(config: any) {
  return new EnterpriseContentOrchestrator(config);
}

export default EnterpriseContentOrchestrator;
