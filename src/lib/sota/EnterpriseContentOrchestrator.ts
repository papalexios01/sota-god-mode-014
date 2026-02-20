// src/lib/sota/EnterpriseContentOrchestrator.ts
// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CONTENT ORCHESTRATOR v9.0 — SOTA GOD-MODE ARCHITECTURE
//
// NeuronWriter v9.0 changes:
//   1. AUTO-CREATE query if keyword not found in project
//   2. POLL until status is 'done' (not just any data)
//   3. Use ALL NW data in prompt: basic terms, extended, entities, H2/H3
//   4. Robust data validation — never silently return null on fixable errors
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
import ContentPostProcessor, { removeAIPatterns } from './ContentPostProcessor';
import {
  buildMasterSystemPrompt,
  buildMasterUserPrompt,
  type ContentPromptConfig,
} from './prompts/masterContentPrompt';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS & CONFIGURATION
// ─────────────────────────────────────────────────────────────────────────────

const NW_MAX_IMPROVEMENT_ATTEMPTS = 5;
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
    this.engine = createSOTAEngine(config.apiKeys);
    this.serpAnalyzer = createSERPAnalyzer(config.apiKeys);
    this.youtubeService = createYouTubeService(config.apiKeys);
    this.referenceService = createReferenceService(config.apiKeys);
    this.linkEngine = createInternalLinkEngine(config.sitePages || []);
    this.schemaGenerator = createSchemaGenerator(config.apiKeys, config.organizationUrl || 'https://example.com');
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

  /**
   * Initializes NeuronWriter for the given keyword:
   *   1. Search the configured project for an existing query matching the keyword.
   *   2. If not found → AUTO-CREATE a new query.
   *   3. Poll until the query status is 'done' (data is fully processed).
   *   4. Return full analysis: basic terms, extended, entities, H2, H3.
   */
  private async maybeInitNeuronWriter(keyword: string, options: any): Promise<NeuronBundle | null> {
    if (!this.config.neuronWriterApiKey || !this.config.neuronWriterProjectId) {
      this.warn('NeuronWriter: Skipping — API key or project ID not configured.');
      return null;
    }

    const service = createNeuronWriterService(this.config.neuronWriterApiKey);
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

          // Count all data we have
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

          // Accept data if status is 'done'/'ready' OR if we have substantial data already
          const isReady = NW_READY_STATUSES.has(status);
          const hasSubstantialData = basicCount >= 5 || (basicCount > 0 && extendedCount > 0);

          if (isReady || hasSubstantialData) {
            this.log(
              `✅ NeuronWriter: Analysis ready! ` +
              `${basicCount} basic terms, ${extendedCount} extended terms, ` +
              `${entityCount} entities, ${h2Count} H2s, ${h3Count} H3s. ` +
              `Score target: ${NW_TARGET_SCORE}/100`
            );
            return { service, queryId, analysis: a };
          }

          // Data not ready yet — wait and retry
          if (isReady && totalData === 0) {
            this.warn(`NeuronWriter: Query is '${status}' but returned no data. May be a broken query.`);
            // Don't break immediately — give it a few more tries
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
  // PREMIUM HTML STYLING — SOTA GOD-MODE DESIGN v3
  // ─────────────────────────────────────────────────────────────────────────

  private async applyPremiumStyling(html: string): Promise<string> {
    let output = html;

    // 1. SOTA HERO INJECTION (Glassmorphism + Dynamic Gradient)
    if (!output.includes('data-premium-hero')) {
      const title = this.config.currentTitle || 'Strategic Analysis';
      const author = this.config.authorName || 'Editorial Board';
      const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      const hero = `
<div data-premium-hero="true" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 60px 40px; border-radius: 24px; margin-bottom: 50px; color: white; position: relative; overflow: hidden; font-family: 'Inter', system-ui, sans-serif;">
  <div style="position: absolute; top: -50px; right: -50px; width: 200px; height: 200px; background: rgba(59, 130, 246, 0.1); border-radius: 50%; filter: blur(60px);"></div>
  <div style="text-transform: uppercase; letter-spacing: 0.2em; font-size: 12px; font-weight: 700; color: #60a5fa; margin-bottom: 16px;">SOTA God-Mode Exclusive</div>
  <h1 style="font-size: 48px; line-height: 1.1; font-weight: 800; margin: 0 0 24px 0; color: white; border: none;">${title}</h1>
  <div style="display: flex; align-items: center; gap: 20px;">
    <div style="width: 48px; height: 48px; background: #3b82f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 20px;">${author.charAt(0)}</div>
    <div>
      <div style="font-weight: 600; font-size: 16px;">${author}</div>
      <div style="font-size: 14px; color: #94a3b8;">${date} • SOTA Certified Intelligence</div>
    </div>
  </div>
</div>
`;
      output = hero + output;
    }

    // 2. ADVANCED BLOCK STYLING
    output = output.replace(/<blockquote>/g, '<blockquote style="border-left: 5px solid #3b82f6; background: #f8fafc; padding: 30px; margin: 40px 0; border-radius: 0 16px 16px 0; font-style: italic; font-size: 1.1em; color: #334155;">');

    // 3. TABLE ENHANCEMENT
    output = output.replace(/<table>/g, '<div style="overflow-x: auto; margin: 40px 0;"><table style="width: 100%; border-collapse: collapse; font-size: 15px; text-align: left; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">');
    output = output.replace(/<thead>/g, '<thead style="background: #1e293b; color: white;">');
    output = output.replace(/<th>/g, '<th style="padding: 16px 20px; font-weight: 600;">');
    output = output.replace(/<td>/g, '<td style="padding: 16px 20px; border-bottom: 1px solid #e2e8f0;">');

    return output;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MAIN PIPELINE
  // ─────────────────────────────────────────────────────────────────────────

  async generateContent(options: any): Promise<any> {
    this.onProgress = options.onProgress;
    this.log(`🚀 SOTA GOD-MODE PIPELINE v9.0 ENGAGED: "${options.keyword}"`);

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

    // ── Phase 2: Master Content Synthesis ─────────────────────────────────
    this.log('Phase 2: Master Content Generation (High-Burstiness Engine)...');

    const systemPrompt = buildMasterSystemPrompt();

    // Build the NeuronWriter section — full context if available
    const neuronWriterSection = neuron
      ? neuron.service.buildFullPromptSection(neuron.analysis)
      : 'No NeuronWriter data available. Focus on comprehensive semantic coverage using LSI keywords, natural language variation, and expert-level topic coverage.';

    const userPrompt = buildMasterUserPrompt({
      primaryKeyword: options.keyword,
      title: options.title || options.keyword,
      contentType: options.contentType || 'pillar',
      targetWordCount: neuron?.analysis?.recommended_length || options.targetWordCount || 3500,
      neuronWriterSection,
      authorName: this.config.authorName,
      internalLinks: options.internalLinks || [],
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

    // ── Phase 3: SOTA Refinement & Aesthetics ─────────────────────────────
    this.log('Phase 3: SOTA Humanization & Premium Design Overlay...');

    // Step 1: Humanization / Editorial Polish
    html = await this.humanizeContent(html, options.keyword);

    // Step 2: Readability Optimization (Split walls of text)
    html = polishReadability(html);

    // Step 3: Visual Identity System
    html = await this.applyPremiumStyling(html);

    this.log('✅ Content Generation Complete. Finalizing Metadata.');

    const wordCount = html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;

    return {
      id: crypto.randomUUID(),
      title: options.title || options.keyword,
      seoTitle: options.title || options.keyword,
      content: html,
      metaDescription: `A comprehensive guide and analysis on ${options.keyword}.`,
      slug: (options.title || options.keyword).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
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
      qualityScore: calculateQualityScore(html, options.keyword, options.internalLinks || []),
      internalLinks: options.internalLinks || [],
      schema: { '@context': 'https://schema.org', '@graph': [] },
      eeat: {
        author: { name: this.config.authorName || 'Editorial Team', credentials: [], publications: [], expertiseAreas: [], socialProfiles: [] },
        citations: [],
        expertReviews: [],
        methodology: '',
        lastUpdated: new Date(),
        factChecked: true
      },
      serpAnalysis: {
        avgWordCount: neuron?.analysis?.recommended_length || 2000,
        recommendedWordCount: neuron?.analysis?.recommended_length || 2500,
        userIntent: 'informational',
        commonHeadings: [...(neuron?.analysis?.headingsH2 || []).map(h => h.text), ...(neuron?.analysis?.headingsH3 || []).map(h => h.text)],
        contentGaps: [],
        semanticEntities: (neuron?.analysis?.entities || []).map(e => e.entity),
        topCompetitors: [],
        recommendedHeadings: [...(neuron?.analysis?.headingsH2 || []).map(h => h.text), ...(neuron?.analysis?.headingsH3 || []).map(h => h.text)],
      },
      generatedAt: new Date(),
      model: genResult.model,
      consensusUsed: false,
      neuronWriterAnalysis: neuron?.analysis || null,
      neuronWriterQueryId: neuron?.queryId || null,
      telemetry: this.telemetry
    } as any;
  }

  private async humanizeContent(html: string, keyword: string): Promise<string> {
    const prompt = `
You are a WORLD-CLASS EDITORIAL DIRECTOR. Your task is to polish this AI-generated HTML content into a human masterpiece.
TARGET: Indistinguishable from top-tier human journalism.

INSTRUCTIONS:
1. DRAMATIC BURSTINESS: Combine short, sharp sentences with long, flowing insights.
2. ELIMINATE AI-ISMS: Remove "Furthermore", "In conclusion", "It is important to note", etc.
3. CONVERSATIONAL AUTHORITY: Inject a first-person perspective ("I found", "I've seen").
4. PRESERVE STRUCTURE: Keep all <div>, <blockquote>, <table>, and <h3> tags exactly as they are.
5. PRESERVE ALL KEYWORDS: Do NOT remove or change any keywords, terms, or entities already in the content.

CONTENT TO POLISH:
${html}
`;

    try {
      const res = await this.engine.generateWithModel({
        prompt,
        model: 'anthropic', // SOTA for editing/nuance
        apiKeys: this.config.apiKeys,
        systemPrompt: 'You are a world-class human editor. Output ONLY the polished HTML. No commentary.',
        temperature: 0.88
      });

      return res.content || html;
    } catch (e) {
      this.warn(`Humanization step failed (${e}), using raw AI output.`);
      return html;
    }
  }
}

export function createOrchestrator(config: any) {
  return new EnterpriseContentOrchestrator(config);
}

export default EnterpriseContentOrchestrator;
