// src/lib/sota/index.ts
// SOTA Content Engine — Enterprise Barrel Export v3.2 (All exports verified)

// ─── Core Types ──────────────────────────────────────────────────────────────
export type {
  GeneratedContent,
  QualityScore,
  ContentMetrics,
  AnalyticsDashboardData,
} from "./types";

// ─── NeuronWriter Service (class + factory + scoring + types) ────────────────
export {
  NeuronWriterService,
  createNeuronWriterService,
  scoreContentAgainstNeuron,
} from "./NeuronWriterService";

export type {
  NeuronWriterAnalysis,
  NeuronWriterTermData,
  NeuronWriterHeadingData,
} from "./NeuronWriterService";

// Backward-compatible standalone wrappers (old code may still import these)
import { NeuronWriterService as _NWService } from "./NeuronWriterService";
import type { NeuronWriterAnalysis as _NWAnalysis } from "./NeuronWriterService";

export async function fetchNeuronWriterAnalysis(
  apiKey: string,
  projectId: string,
  keyword: string,
): Promise<{ success: boolean; analysis?: _NWAnalysis; error?: string }> {
  const service = new _NWService(apiKey);
  const queryResult = await service.findQueryByKeyword(projectId, keyword);
  if (!queryResult.success || !queryResult.query) {
    return { success: false, error: queryResult.error || "Query not found" };
  }
  return service.getQueryAnalysis(queryResult.query.id);
}

export function buildNeuronWriterPromptSection(
  analysis: _NWAnalysis | null | undefined,
): string {
  if (!analysis) return "";
  const service = new _NWService("unused");
  return service.formatTermsForPrompt(analysis.terms || [], analysis);
}

// ─── Internal Link Engine ────────────────────────────────────────────────────
export { SOTAInternalLinkEngine, createInternalLinkEngine } from "./SOTAInternalLinkEngine";
export type { InternalLink } from "./types";

// ─── Content Prompt Builder ──────────────────────────────────────────────────
export { buildMasterSystemPrompt, buildMasterUserPrompt } from "./prompts/masterContentPrompt";
export type { ContentPromptConfig } from "./prompts/masterContentPrompt";

// ─── Content Post-Processor ──────────────────────────────────────────────────
export {
  ContentPostProcessor,
  enhanceHtmlDesign,
  injectMissingTerms,
  addFaqSection,
  postProcessContent,
} from "./ContentPostProcessor";

// ─── Schema Generator ────────────────────────────────────────────────────────
export { SchemaGenerator } from "./SchemaGenerator";

// ─── EEAT Validator ──────────────────────────────────────────────────────────
export { EEATValidator } from "./EEATValidator";

// ─── Quality Validator ───────────────────────────────────────────────────────
export {
  calculateQualityScore,
  analyzeContent,
  removeAIPhrases,
  polishReadability,
  validateVisualBreaks,
} from "./QualityValidator";

// ─── Performance Tracker ─────────────────────────────────────────────────────
export { globalPerformanceTracker } from "./PerformanceTracker";

// ─── Reference Service ───────────────────────────────────────────────────────
export { ReferenceService } from "./ReferenceService";

// ─── YouTube Service ─────────────────────────────────────────────────────────
export { YouTubeService } from "./YouTubeService";

// ─── SERP Analyzer ───────────────────────────────────────────────────────────
export { SERPAnalyzer } from "./SERPAnalyzer";

// ─── SEO Health Scorer ───────────────────────────────────────────────────────
export { SEOHealthScorer } from "./SEOHealthScorer";

// ─── God Mode Engine ─────────────────────────────────────────────────────────
export { GodModeEngine } from "./GodModeEngine";

// ─── Cache ───────────────────────────────────────────────────────────────────
export { generationCache } from "./cache";

// ─── Sanitize (export both old and new names for compatibility) ──────────────
export {
  sanitizeHtml as sanitizeContent,
  sanitizeHtml,
  stripHtml,
  htmlToText,
} from "./sanitize";

// ─── Enterprise Orchestrator ─────────────────────────────────────────────────
export { createOrchestrator } from "./EnterpriseContentOrchestrator";
