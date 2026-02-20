// src/lib/sota/EnterpriseContentOrchestrator.ts
// ═══════════════════════════════════════════════════════════════════════════════
// ENTERPRISE CONTENT ORCHESTRATOR v7.2 — SOTA GOD-MODE ARCHITECTURE
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
const NW_TARGET_SCORE = 96;
const NW_MAX_POLL_ATTEMPTS = 200;
const NW_POLL_INTERVAL_MS = 12000;
const NW_HARD_LIMIT_MS = 900000; // 15 minutes for ultimate SOTA deep-dive
const MIN_VALID_CONTENT_LENGTH = 1200;

type NeuronBundle = {
  service: NeuronWriterService;
  queryId: string;
  analysis: NeuronWriterAnalysis;
};

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
    this.schemaGenerator = createSchemaGenerator(config.apiKeys);
    this.eeatValidator = createEEATValidator(config.apiKeys);
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
  // NEURONWRITER INTEGRATION — SOTA RESILIENT POLLING v2
  // ─────────────────────────────────────────────────────────────────────────

  private async maybeInitNeuronWriter(keyword: string, options: any): Promise<NeuronBundle | null> {
    if (!this.config.neuronWriterApiKey || !this.config.neuronWriterProjectId) return null;
    
    const service = createNeuronWriterService(this.config.neuronWriterApiKey);
    const projectId = this.config.neuronWriterProjectId;
    const startTime = Date.now();

    try {
      this.log(`NeuronWriter: Locating target query for "${keyword}"...`);
      const searchRes = await service.findQueryByKeyword(projectId, keyword);
      let queryId = searchRes.query?.id;

      if (!queryId) {
        this.warn(`NeuronWriter: Query not found for "${keyword}". Initializing content plan...`);
        // Future: Auto-create query if missing
        return null;
      }

      this.log(`NeuronWriter: Query ${queryId} found. Engaging real-time data extraction...`);
      
      for (let i = 0; i < NW_MAX_POLL_ATTEMPTS; i++) {
        const res = await service.getQueryAnalysis(queryId);
        if (res.success && res.analysis) {
          const a = res.analysis;
          const hasData = (a.terms?.length || 0) > 0 || (a.entities?.length || 0) > 0;
          
          if (hasData) {
            this.log(`NeuronWriter: SOTA Analysis Loaded (${a.terms?.length} terms, Score: ${a.contentScore || 0}).`);
            return { service, queryId, analysis: a };
          }
        }

        const elapsed = Date.now() - startTime;
        if (elapsed > NW_HARD_LIMIT_MS) {
          this.warn('NeuronWriter: SOTA Timeout (15m limit reached). Proceeding with cache.');
          break;
        }

        await new Promise(r => setTimeout(r, NW_POLL_INTERVAL_MS));
        if (i % 5 === 0) this.log(`NeuronWriter: Processing semantic data... (${Math.round(elapsed/1000)}s)`);
      }

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
    this.log(`🚀 SOTA GOD-MODE PIPELINE v7.2 ENGAGED: "${options.keyword}"`);
    
    this.config.currentTitle = options.title || options.keyword;
    this.config.authorName = options.authorName || 'SOTA AI Research';

    // Phase 1: Semantic Context Initialization
    const neuron = await this.maybeInitNeuronWriter(options.keyword, options);

    // Phase 2: Master Content Synthesis
    this.log('Phase 2: Master Content Generation (High-Burstiness Engine)...');
    
    const systemPrompt = buildMasterSystemPrompt();
    const userPrompt = buildMasterUserPrompt({
      primaryKeyword: options.keyword,
      title: options.title || options.keyword,
      contentType: options.contentType || 'pillar',
      targetWordCount: options.targetWordCount || 3500,
      neuronWriterSection: neuron ? neuron.service.formatTermsForPrompt(neuron.analysis.terms || [], neuron.analysis) : 'INTEGRATE HIGH-VALUE SEMANTIC TERMS MANUALLY.',
      authorName: this.config.authorName,
      internalLinks: options.internalLinks || []
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

    // Phase 3: SOTA Refinement & Aesthetics
    this.log('Phase 3: SOTA Humanization & Premium Design Overlay...');
    
    // Step 1: Humanization / Editorial Polish
    html = await this.humanizeContent(html, options.keyword);
    
    // Step 2: Readability Optimization (Split walls of text)
    html = polishReadability(html);
    
    // Step 3: Visual Identity System
    html = await this.applyPremiumStyling(html);

    this.log('✅ Content Generation Complete. Finalizing Metadata.');

    return {
      content: html,
      qualityScore: calculateQualityScore(html, options.keyword, options.internalLinks || []),
      neuronWriterAnalysis: neuron?.analysis,
      neuronWriterQueryId: neuron?.queryId,
      telemetry: this.telemetry,
      metadata: {
        wordCount: html.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length,
        generatedAt: new Date().toISOString(),
        engine: 'SOTA-GOD-MODE-v7.2',
        modelUsed: genResult.model
      }
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

CONTENT TO POLISH:
${html}
`;

    const res = await this.engine.generateWithModel({
      prompt,
      model: 'anthropic', // SOTA for editing/nuance
      apiKeys: this.config.apiKeys,
      systemPrompt: 'You are a world-class human editor. Output ONLY the polished HTML. No commentary.',
      temperature: 0.88
    });

    return res.content || html;
  }
}

export function createOrchestrator(config: any) {
  return new EnterpriseContentOrchestrator(config);
}

export default EnterpriseContentOrchestrator;
