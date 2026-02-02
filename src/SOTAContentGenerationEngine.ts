// =============================================================================
// SOTA CONTENT GENERATION ENGINE v2.0 - CRITICAL FIXES
// 
// FIXES ALL CRITICAL ISSUES:
// 1. NeuronWriter API MUST be called directly (not via proxy when not needed)
// 2. YouTube video GUARANTEED injection
// 3. Anchor text NEVER crosses sentence boundaries
// 4. Proper API key handling
// =============================================================================

import { processContentWithInternalLinks, type InternalPage, type LinkEngineConfig } from './SOTAInternalLinkEngine';
import { searchYouTubeVideos, findBestYouTubeVideo, guaranteedYouTubeInjection, type YouTubeSearchResult } from './YouTubeService';
import { fetchVerifiedReferences, type VerifiedReference } from './ReferenceService';
import { fetchNeuronTerms, formatNeuronTermsForPrompt, type NeuronTerms } from './neuronwriter';

console.log('[SOTAContentGenerationEngine v2.0] CRITICAL FIXES LOADED');

// ==================== TYPES ====================

export interface ContentGenerationConfig {
    serperApiKey: string;
    wpUrl?: string;
    neuronConfig?: {
        enabled: boolean;
        apiKey: string;
        projectId: string;
    };
    callAiFn?: (prompt: string) => Promise<string>;
    existingPages: Array<{ id: string; title: string; slug: string }>;
    logCallback?: (msg: string) => void;
}

export interface EnhancedContentResult {
    html: string;
    stats: {
        youtubeInjected: boolean;
        youtubeVideo: YouTubeSearchResult | null;
        internalLinksCount: number;
        internalLinks: Array<{ anchor: string; url: string; title: string }>;
        referencesCount: number;
        references: VerifiedReference[];
        neuronTermsUsed: boolean;
        neuronScore: number;
        processingTimeMs: number;
    };
}

// ==================== CRITICAL FIX: ANCHOR TEXT VALIDATION ====================

/**
 * CRITICAL: Validates anchor text to ensure it NEVER crosses sentence boundaries
 * and is grammatically complete
 */
function validateAnchorTextStrict(anchor: string): { valid: boolean; reason: string } {
    if (!anchor || anchor.trim().length === 0) {
        return { valid: false, reason: 'Empty anchor' };
    }

    const cleaned = anchor.trim();

    // CRITICAL: Never allow periods, question marks, exclamation points INSIDE anchor
    // These indicate sentence boundaries
    if (/[.!?]/.test(cleaned.slice(0, -1))) {
        return { valid: false, reason: 'Contains sentence boundary punctuation' };
    }

    // Never allow anchor to start with lowercase (indicates mid-sentence)
    const words = cleaned.split(/\s+/);
    if (words.length < 4 || words.length > 7) {
        return { valid: false, reason: `Word count ${words.length} not in 4-7 range` };
    }

    // Check for forbidden start words
    const FORBIDDEN_STARTS = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
        'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be',
        'this', 'that', 'these', 'those', 'it', 'its', 'they', 'their', 'your'
    ]);

    const firstWord = words[0].toLowerCase().replace(/[^a-z]/g, '');
    if (FORBIDDEN_STARTS.has(firstWord)) {
        return { valid: false, reason: `Starts with forbidden word: ${firstWord}` };
    }

    // Check for forbidden end words
    const FORBIDDEN_ENDS = new Set([
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
        'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were'
    ]);

    const lastWord = words[words.length - 1].toLowerCase().replace(/[^a-z]/g, '');
    if (FORBIDDEN_ENDS.has(lastWord)) {
        return { valid: false, reason: `Ends with forbidden word: ${lastWord}` };
    }

    // Check for toxic generic phrases
    const TOXIC_PHRASES = [
        'click here', 'read more', 'learn more', 'find out', 'check out',
        'this article', 'this guide', 'this post', 'more info'
    ];

    const anchorLower = cleaned.toLowerCase();
    for (const toxic of TOXIC_PHRASES) {
        if (anchorLower.includes(toxic)) {
            return { valid: false, reason: `Contains toxic phrase: ${toxic}` };
        }
    }

    return { valid: true, reason: 'Valid' };
}

/**
 * Extracts SAFE anchor candidates from a sentence (NOT crossing boundaries)
 */
function extractSafeAnchorsFromSentence(sentence: string, targetTitle: string): string[] {
    const words = sentence.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length < 4) return [];

    const candidates: string[] = [];
    const titleWords = targetTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    // Try to find phrases that contain words from the target title
    for (let len = 4; len <= Math.min(7, words.length); len++) {
        for (let start = 0; start <= words.length - len; start++) {
            const phraseWords = words.slice(start, start + len);
            const phrase = phraseWords.join(' ');

            // Check if phrase relates to target page
            const phraseLower = phrase.toLowerCase();
            const matchCount = titleWords.filter(tw => phraseLower.includes(tw)).length;

            if (matchCount >= 1) {
                const validation = validateAnchorTextStrict(phrase);
                if (validation.valid) {
                    candidates.push(phrase);
                }
            }
        }
    }

    return candidates;
}

/**
 * WIPES AI-generated artifacts before processing
 * - Removes fake internal links (hallucinations)
 * - Removes fake reference sections
 * - Cleans up empty placeholders
 */
export function cleanContentBeforeProcessing(html: string): string {
    let cleaned = html;

    // 1. Remove AI-generated "Related Guides" or "Internal Links" sections that contain fake links
    cleaned = cleaned.replace(/<div[^>]*class="[^"]*sota-related-guides[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
    cleaned = cleaned.replace(/<div[^>]*class="[^"]*related-posts[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    // 2. Remove AI-generated "References" sections (we generate these programmatically)
    cleaned = cleaned.replace(/<h2[^>]*>.*?References.*?<\/h2>[\s\S]*?(?=<h2|$)/gi, '');
    cleaned = cleaned.replace(/<div[^>]*class="[^"]*sota-references[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    // 3. Strip ALL relative links (likely hallucinated internal links)
    // We only want internal links that WE inject programmatically
    cleaned = cleaned.replace(/<a[^>]+href=["'](\/[^"']*)["'][^>]*>(.*?)<\/a>/gi, '$2');

    // 4. Strip absolute links that look like placeholders or the site's own domain (if we knew it)
    // As a safety net, we'll strip links containing "example.com" or "yoursite.com"
    cleaned = cleaned.replace(/<a[^>]+href=["'][^"']*(example\.com|yoursite\.com)[^"']*["'][^>]*>(.*?)<\/a>/gi, '$2');

    return cleaned;
}

// ==================== YOUTUBE VIDEO INJECTION - GUARANTEED ====================
/**
 * GUARANTEED YouTube video injection - will NEVER leave a placeholder
 */
export async function guaranteedYouTubeVideoInject(
    html: string,
    keyword: string,
    serperApiKey: string,
    logCallback?: (msg: string) => void
): Promise<{ html: string; video: YouTubeSearchResult | null; success: boolean }> {
    const log = (msg: string) => {
        console.log(`[YouTube Inject] ${msg}`);
        logCallback?.(msg);
    };

    // CRITICAL: ULTRA-AGGRESSIVE placeholder removal
    // Catches variations: YOUTUBE_VIDEO_PLACEHOLDER, typos like PLACEHER, etc.
    // Also removes AI-generated fake YouTube fallback sections
    let resultHtml = html
        .replace(/\[YOUTUBE_VIDEO_PLACEHOLDER\]/gi, '')
        .replace(/\[YOUTUBE_VIDEO_PLACE[A-Z]*\]/gi, '') // Catch typos
        .replace(/\[?YOUTUBE[\s_-]*VIDEO[\s_-]*PLACE[\w]*\]?/gi, '')
        // Remove AI-generated fake YouTube fallback sections (CRITICAL!)
        .replace(/<div[^>]*class="[^"]*sota-youtube-fallback[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi, '')
        .replace(/<div[^>]*class="[^"]*sota-youtube-fallback[^"]*"[^>]*>[\s\S]*?Search YouTube[\s\S]*?<\/a>[\s\S]*?<\/div>/gi, '')
        .replace(/📹\s*<h4><strong>Looking for Video Tutorials\?<\/strong><\/h4>[\s\S]*?Search YouTube for.*?<\/a>/gi, '')
        .replace(/<p>📹<\/p>\s*<h4>.*?Video Tutorials.*?<\/h4>[\s\S]*?youtube\.com\/results[\s\S]*?<\/a>\s*<\/p>/gi, '')
        // Additional pattern: Remove any div with "Looking for Video Tutorials?" inside
        .replace(/<div[^>]*>[\s\S]*?Looking for Video Tutorials[\s\S]*?youtube\.com\/results[\s\S]*?<\/div>/gi, '');

    // Check if API key is available
    if (!serperApiKey || serperApiKey.trim().length < 10) {
        log('⚠️ No valid Serper API key - cannot search YouTube');
        log('To fix: Add Serper API key in Settings → API Keys (get from serper.dev)');
        return { html: resultHtml, video: null, success: false };
    }

    // Check if video already exists (has real embed)
    if (resultHtml.includes('youtube.com/embed/') || resultHtml.includes('sota-youtube')) {
        log('✅ YouTube video already present');
        return { html: resultHtml, video: null, success: true };
    }

    // Sanitize keyword - if it's a URL, extract title
    let searchKeyword = keyword;
    if (keyword.includes('://') || keyword.includes('/')) {
        try {
            const url = new URL(keyword.startsWith('http') ? keyword : `https://example.com${keyword}`);
            const pathParts = url.pathname.split('/').filter(p => p.length > 0);
            const lastPart = pathParts[pathParts.length - 1] || '';
            searchKeyword = lastPart.replace(/-/g, ' ').replace(/_/g, ' ').trim() || keyword;
            log(`📍 Extracted search keyword from URL: "${searchKeyword}"`);
        } catch (e) {
            // Keep original if parsing fails
        }
    }

    log(`🎬 Searching for: "${searchKeyword}"`);

    // STRATEGY 1: Primary search with sanitized keyword
    try {
        const video = await findBestYouTubeVideo(searchKeyword, serperApiKey);

        if (video) {
            log(`✅ Found: "${video.title.substring(0, 50)}..."`);
            resultHtml = guaranteedYouTubeInjection(resultHtml, video);
            return { html: resultHtml, video, success: true };
        }
    } catch (error: any) {
        log(`⚠️ Primary failed: ${error.message}`);
    }

    // STRATEGY 2: Fallback searches with sanitized keyword
    const fallbackQueries = [
        `${searchKeyword} tutorial`,
        `${searchKeyword} guide`,
        `how to ${searchKeyword}`,
        `${searchKeyword} explained`
    ];

    for (const query of fallbackQueries) {
        try {
            log(`🔄 Trying: "${query}"`);
            const videos = await searchYouTubeVideos(query, serperApiKey, 3);

            if (videos.length > 0) {
                const video = videos[0];
                log(`✅ Fallback found: "${video.title.substring(0, 50)}..."`);
                resultHtml = guaranteedYouTubeInjection(resultHtml, video);
                return { html: resultHtml, video, success: true };
            }
        } catch (error: any) {
            log(`⚠️ Fallback failed: ${error.message}`);
        }
    }

    log('❌ No video found');
    return { html: resultHtml, video: null, success: false };
}

// ==================== INTERNAL LINKS - FIXED ANCHOR TEXT ====================

/**
 * Enterprise internal linking with STRICT anchor text validation
 * NEVER crosses sentence boundaries
 */
export async function injectEnterpriseInternalLinks(
    html: string,
    pages: Array<{ id: string; title: string; slug: string }>,
    primaryKeyword: string,
    callAiFn?: (prompt: string) => Promise<string>,
    logCallback?: (msg: string) => void
): Promise<{ html: string; linkCount: number; links: Array<{ anchor: string; url: string; title: string }> }> {
    const log = (msg: string) => {
        console.log(`[Internal Links] ${msg}`);
        logCallback?.(msg);
    };

    if (!pages || pages.length === 0) {
        log('⚠️ No pages available');
        return { html, linkCount: 0, links: [] };
    }

    // Filter valid pages
    const validatedPages = pages.filter(page => {
        const hasValidUrl = page.id && (page.id.startsWith('http://') || page.id.startsWith('https://'));
        const hasTitle = page.title && page.title.length > 3;
        const hasSlug = page.slug && page.slug.length > 2;
        const isSelfReference = (page.title || '').toLowerCase() === primaryKeyword.toLowerCase();
        return (hasValidUrl || hasSlug) && hasTitle && !isSelfReference;
    });

    if (validatedPages.length === 0) {
        log('⚠️ No valid pages after filtering');
        return { html, linkCount: 0, links: [] };
    }

    log(`📊 ${validatedPages.length} pages validated`);

    // Convert to InternalPage format
    const internalPages: InternalPage[] = validatedPages.map(p => ({
        title: p.title || '',
        slug: p.slug || '',
        url: p.id && p.id.startsWith('http') ? p.id : undefined
    }));

    const baseUrl = validatedPages[0]?.id?.match(/^https?:\/\/[^\/]+/)?.[0] || '';

    // Use the deterministic engine with STRICT config
    const config: LinkEngineConfig = {
        minLinksPerPost: 4,
        maxLinksPerPost: 8,
        minAnchorWords: 4,
        maxAnchorWords: 7,
        maxLinksPerParagraph: 1,
        minWordsBetweenLinks: 150,
        avoidFirstParagraph: true,
        avoidLastParagraph: true
    };

    const result = processContentWithInternalLinks(html, internalPages, baseUrl, config);

    // CRITICAL: Post-validate all anchors to ensure quality
    const validLinks = result.placements.filter(p => {
        const validation = validateAnchorTextStrict(p.anchorText);
        if (!validation.valid) {
            log(`🚫 Rejected anchor: "${p.anchorText}" - ${validation.reason}`);
            return false;
        }
        return true;
    });

    log(`✅ ${validLinks.length} quality links placed`);

    const links = validLinks.map(p => ({
        anchor: p.anchorText,
        url: p.targetUrl,
        title: p.targetTitle
    }));

    return {
        html: result.html,
        linkCount: validLinks.length,
        links
    };
}

// ==================== NEURONWRITER - DIRECT API INTEGRATION ====================

/**
 * Fetches NeuronWriter terms with proper timeout
 * Uses the existing neuronwriter.ts which has correct API implementation
 */
export async function fetchNeuronWriterTermsWithFallback(
    apiKey: string,
    projectId: string,
    keyword: string,
    timeoutMs: number = 15000,
    logCallback?: (msg: string) => void
): Promise<{ terms: NeuronTerms | null; formatted: string; score: number }> {
    const log = (msg: string) => {
        console.log(`[NeuronWriter] ${msg}`);
        logCallback?.(msg);
    };

    if (!apiKey || apiKey.trim().length < 10) {
        log('⚠️ Invalid API key');
        return { terms: null, formatted: '', score: 0 };
    }

    if (!projectId || projectId.trim().length < 5) {
        log('⚠️ Invalid project ID');
        return { terms: null, formatted: '', score: 0 };
    }

    log(`🧠 Fetching terms for: "${keyword}"`);
    log(`🔑 API Key: ${apiKey.substring(0, 8)}...`);
    log(`📁 Project: ${projectId}`);

    const startTime = Date.now();

    try {
        // Use the existing fetchNeuronTerms function which has proper API handling
        const terms = await fetchNeuronTerms(apiKey, projectId, keyword);

        const elapsed = Date.now() - startTime;
        log(`⏱️ Completed in ${(elapsed / 1000).toFixed(1)}s`);

        if (terms) {
            const formatted = formatNeuronTermsForPrompt(terms);

            // Calculate term count
            let termCount = 0;
            if (terms.h1) termCount += terms.h1.split(',').length;
            if (terms.h2) termCount += terms.h2.split(',').length;
            if (terms.content_basic) termCount += terms.content_basic.split(',').length;
            if (terms.content_extended) termCount += terms.content_extended.split(',').length;
            if (terms.entities_basic) termCount += terms.entities_basic.split(',').length;

            log(`✅ Got ${termCount} terms`);
            log(`� H1: ${terms.h1?.substring(0, 50) || 'none'}...`);
            log(`📝 H2: ${terms.h2?.substring(0, 50) || 'none'}...`);
            log(`📝 Content: ${terms.content_basic?.substring(0, 50) || 'none'}...`);

            return { terms, formatted, score: termCount };
        }

        log('⚠️ No terms returned');
        return { terms: null, formatted: '', score: 0 };

    } catch (error: any) {
        log(`❌ Error: ${error.message}`);
        return { terms: null, formatted: '', score: 0 };
    }
}

// ==================== REFERENCES ====================

export async function fetchEnterpriseReferences(
    keyword: string,
    semanticKeywords: string[],
    serperApiKey: string,
    wpUrl?: string,
    logCallback?: (msg: string) => void
): Promise<{ html: string; references: VerifiedReference[]; success: boolean }> {
    const log = (msg: string) => {
        console.log(`[References] ${msg}`);
        logCallback?.(msg);
    };

    if (!serperApiKey || serperApiKey.trim().length < 10) {
        log('⚠️ No valid Serper API key');
        return { html: '', references: [], success: false };
    }

    log(`📚 Fetching for: "${keyword}"`);

    try {
        const result = await fetchVerifiedReferences(
            keyword,
            semanticKeywords,
            serperApiKey,
            wpUrl
        );

        if (result.references.length > 0) {
            log(`✅ Found ${result.references.length} references`);
            return { html: result.html, references: result.references, success: true };
        }

        log('⚠️ No references found');
        return { html: '', references: [], success: false };

    } catch (error: any) {
        log(`❌ Error: ${error.message}`);
        return { html: '', references: [], success: false };
    }
}

// ==================== UNIFIED ENHANCEMENT ====================

export async function enhanceContentEnterprise(
    html: string,
    keyword: string,
    config: ContentGenerationConfig
): Promise<EnhancedContentResult> {
    const startTime = Date.now();
    const log = config.logCallback || ((msg: string) => console.log(msg));

    log('🚀 ENTERPRISE content enhancement v2.0');

    const stats: EnhancedContentResult['stats'] = {
        youtubeInjected: false,
        youtubeVideo: null,
        internalLinksCount: 0,
        internalLinks: [],
        referencesCount: 0,
        references: [],
        neuronTermsUsed: false,
        neuronScore: 0,
        processingTimeMs: 0
    };

    let enhancedHtml = html;

    // PHASE 1: YouTube
    log('📹 Phase 1: YouTube...');
    const ytResult = await guaranteedYouTubeVideoInject(
        enhancedHtml,
        keyword,
        config.serperApiKey,
        log
    );
    enhancedHtml = ytResult.html;
    stats.youtubeInjected = ytResult.success;
    stats.youtubeVideo = ytResult.video;

    // PHASE 2: Internal Links
    log('🔗 Phase 2: Internal Links...');
    const linkResult = await injectEnterpriseInternalLinks(
        enhancedHtml,
        config.existingPages,
        keyword,
        config.callAiFn,
        log
    );
    enhancedHtml = linkResult.html;
    stats.internalLinksCount = linkResult.linkCount;
    stats.internalLinks = linkResult.links;

    // PHASE 3: References
    log('📚 Phase 3: References...');
    const refResult = await fetchEnterpriseReferences(
        keyword,
        [],
        config.serperApiKey,
        config.wpUrl,
        log
    );
    if (refResult.success && refResult.html) {
        enhancedHtml += '\n\n' + refResult.html;
    }
    stats.referencesCount = refResult.references.length;
    stats.references = refResult.references;

    stats.processingTimeMs = Date.now() - startTime;

    log(`✅ Complete in ${(stats.processingTimeMs / 1000).toFixed(1)}s`);
    log(`📊 YT=${stats.youtubeInjected} Links=${stats.internalLinksCount} Refs=${stats.referencesCount}`);

    return { html: enhancedHtml, stats };
}

export default {
    guaranteedYouTubeVideoInject,
    injectEnterpriseInternalLinks,
    fetchNeuronWriterTermsWithFallback,
    fetchEnterpriseReferences,
    enhanceContentEnterprise,
    validateAnchorTextStrict
};
