// src/lib/sota/index.ts
// SOTA Content Engine - Enterprise Barrel Export v3.1 (Fixed)

// Core Types
export type {
  GeneratedContent,
  ContentGenerationOptions,
  QualityScore,
  ContentMetrics,
  NeuronWriterAnalysis,
} from "./types";

// Internal Link Engine
export { generateInternalLinks, applyInternalLinks } from "./SOTAInternalLinkEngine";
export type { InternalLink, SitemapUrl } from "./SOTAInternalLinkEngine";

// NeuronWriter Service — Class, Factory, Scoring, and Types
export {
  NeuronWriterService,
  createNeuronWriterService,
  scoreContentAgainstNeuron,
} from "./NeuronWriterService";
export type { NeuronWriterTermData, NeuronWriterHeadingData } from "./NeuronWriterService";

// Backward-compatible aliases for removed standalone functions
// (Other files may still import these — safe no-op wrappers)
export async function fetchNeuronWriterAnalysis(
  apiKey: string,
  projectId: string,
  keyword: string
): Promise<any> {
  const { createNeuronWriterService: create } = await import("./NeuronWriterService");
  const service = create(apiKey);
  const queryResult = await service.findQueryByKeyword(projectId, keyword);
  if (!queryResult.success || !queryResult.query) {
    return { success: false, error: queryResult.error || "Query not found" };
  }
  return service.getQueryAnalysis(queryResult.query.id);
}

export function buildNeuronWriterPromptSection(
  analysis: any
): string {
  if (!analysis) return "";
  const { createNeuronWriterService: create } = require("./NeuronWriterService");
  const service = create("unused");
  const terms = analysis.terms || [];
  return service.formatTermsForPrompt(terms, analysis);
}

// Content Prompt Builder
export { buildMasterSystemPrompt, buildMasterUserPrompt } from "./prompts/masterContentPrompt";
export type { ContentPromptConfig } from "./prompts/masterContentPrompt";

// Content Post-Processor
export { enhanceHtmlDesign, injectMissingTerms, addFaqSection, postProcessContent } from "./ContentPostProcessor";

// Schema Generator
export { SchemaGenerator } from "./SchemaGenerator";

// EEAT Validator
export { EEATValidator } from "./EEATValidator";

// Quality Validator
export { QualityValidator } from "./QualityValidator";

// Performance Tracker
export { PerformanceTracker, globalPerformanceTracker } from "./PerformanceTracker";
export type { AnalyticsDashboardData } from "./PerformanceTracker";

// Reference Service
export { ReferenceService } from "./ReferenceService";

// YouTube Service
export { YouTubeService } from "./YouTubeService";

// SERP Analyzer
export { SERPAnalyzer } from "./SERPAnalyzer";

// SEO Health Scorer
export { SEOHealthScorer } from "./SEOHealthScorer";

// God Mode Engine
export { GodModeEngine } from "./GodModeEngine";

// Cache
export { SOTACache } from "./cache";

// Sanitize — handle both old and new export names
export { sanitizeHtml as sanitizeContent, sanitizeHtml, stripHtml, htmlToText } from "./sanitize";

// Enterprise Orchestrator
export { createOrchestrator } from "./EnterpriseContentOrchestrator";
