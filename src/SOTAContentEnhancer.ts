// =============================================================================
// SOTA CONTENT ENHANCER v1.0 - PREMIUM BLOG POST STYLING + YOUTUBE INTEGRATION
// Ultra-high quality HTML elements with automatic YouTube video injection
// =============================================================================

import { searchYouTubeVideos, generateYouTubeEmbed, YouTubeSearchResult } from './YouTubeService';
import { processContentWithInternalLinks, InternalPage } from './SOTAInternalLinkEngine';

export interface EnhancementConfig {
  injectYouTube: boolean;
  enhanceCallouts: boolean;
  addProgressIndicators: boolean;
  modernizeComponents: boolean;
  baseUrl: string;
  serperApiKey?: string;
}

const DEFAULT_ENHANCEMENT_CONFIG: EnhancementConfig = {
  injectYouTube: true,
  enhanceCallouts: true,
  addProgressIndicators: true,
  modernizeComponents: true,
  baseUrl: ''
};

export const ULTRA_PREMIUM_STYLES = {
  keyTakeaways: `
    background: linear-gradient(145deg, #0c1426 0%, #1a2744 100%);
    border: 2px solid rgba(59, 130, 246, 0.4);
    border-radius: 20px;
    padding: 2rem 2.5rem;
    margin: 2.5rem 0;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    position: relative;
    overflow: hidden;
  `,

  proTip: `
    display: flex;
    gap: 1.25rem;
    padding: 1.75rem 2rem;
    background: linear-gradient(145deg, #052e16 0%, #14532d 100%);
    border-radius: 16px;
    margin: 2.5rem 0;
    border-left: 5px solid #22c55e;
    box-shadow: 0 10px 40px rgba(34, 197, 94, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  `,

  warning: `
    display: flex;
    gap: 1.25rem;
    padding: 1.75rem 2rem;
    background: linear-gradient(145deg, #450a0a 0%, #7f1d1d 100%);
    border-radius: 16px;
    margin: 2.5rem 0;
    border-left: 5px solid #ef4444;
    box-shadow: 0 10px 40px rgba(239, 68, 68, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  `,

  expertQuote: `
    position: relative;
    margin: 3rem 0;
    padding: 2.5rem 2.5rem 2.5rem 4rem;
    background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%);
    border-radius: 20px;
    border-left: 5px solid #8b5cf6;
    box-shadow: 0 15px 50px rgba(139, 92, 246, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  `,

  table: `
    margin: 3rem 0;
    border-radius: 20px;
    overflow: hidden;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
    border: 2px solid rgba(71, 85, 105, 0.5);
  `,

  youtubeSection: `
    margin: 3.5rem 0;
    padding: 2.5rem;
    background: linear-gradient(145deg, #0a0a14 0%, #111827 100%);
    border-radius: 24px;
    border: 2px solid rgba(99, 102, 241, 0.3);
    box-shadow: 0 30px 80px rgba(99, 102, 241, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  `,

  faqSection: `
    margin: 4rem 0;
    padding: 2.5rem;
    background: linear-gradient(145deg, #0c1426 0%, #111827 100%);
    border-radius: 24px;
    border: 2px solid rgba(59, 130, 246, 0.25);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  `,

  conclusion: `
    margin: 4rem 0;
    padding: 3rem;
    background: linear-gradient(145deg, #052e16 0%, #065f46 100%);
    border-radius: 24px;
    border: 2px solid rgba(34, 197, 94, 0.4);
    box-shadow: 0 30px 80px rgba(34, 197, 94, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  `,

  statHighlight: `
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1.25rem;
    margin: 3rem 0;
  `,

  stepContainer: `
    background: linear-gradient(145deg, #0c1426 0%, #1a2744 100%);
    border-radius: 20px;
    padding: 2.5rem;
    margin: 3rem 0;
    border: 1px solid rgba(59, 130, 246, 0.2);
    box-shadow: 0 15px 50px rgba(0, 0, 0, 0.25);
  `
};

export function generateUltraPremiumKeyTakeaways(takeaways: string[]): string {
  const items = takeaways.map((item, i) => `
    <li style="padding: 1rem 0; display: flex; gap: 1rem; align-items: flex-start; color: #f1f5f9; border-bottom: 1px solid rgba(255, 255, 255, 0.08); line-height: 1.75; font-size: 1.05rem;">
      <span style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: linear-gradient(135deg, #22c55e, #16a34a); border-radius: 50%; flex-shrink: 0; font-weight: 700; font-size: 0.85rem; color: white; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);">${i + 1}</span>
      <span>${item}</span>
    </li>
  `).join('');

  return `
<div class="sota-key-takeaways-ultra" style="${ULTRA_PREMIUM_STYLES.keyTakeaways}">
  <div style="position: absolute; top: 0; left: 0; right: 0; height: 3px; background: linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899);"></div>
  <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.75rem; padding-bottom: 1.25rem; border-bottom: 2px solid rgba(59, 130, 246, 0.25);">
    <div style="display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 14px; box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);">
      <span style="font-size: 1.75rem;">⚡</span>
    </div>
    <div>
      <h3 style="margin: 0; font-size: 1.5rem; font-weight: 800; color: #f1f5f9; letter-spacing: -0.02em;">Key Takeaways</h3>
      <p style="margin: 0.25rem 0 0; font-size: 0.9rem; color: #94a3b8;">Save this for quick reference</p>
    </div>
  </div>
  <ul style="list-style: none; padding: 0; margin: 0;">
    ${items}
  </ul>
</div>`;
}

export function generateUltraPremiumProTip(title: string, content: string): string {
  return `
<div class="sota-pro-tip-ultra" style="${ULTRA_PREMIUM_STYLES.proTip}">
  <div style="display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: linear-gradient(135deg, #22c55e, #16a34a); border-radius: 16px; flex-shrink: 0; box-shadow: 0 8px 25px rgba(34, 197, 94, 0.35);">
    <span style="font-size: 1.75rem;">💎</span>
  </div>
  <div style="flex: 1;">
    <h4 style="margin: 0 0 0.5rem; font-size: 1.15rem; font-weight: 800; color: #4ade80; letter-spacing: -0.01em;">${title}</h4>
    <p style="margin: 0; color: #bbf7d0; line-height: 1.75; font-size: 1.05rem;">${content}</p>
  </div>
</div>`;
}

export function generateUltraPremiumWarning(title: string, content: string): string {
  return `
<div class="sota-warning-ultra" style="${ULTRA_PREMIUM_STYLES.warning}">
  <div style="display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 16px; flex-shrink: 0; box-shadow: 0 8px 25px rgba(239, 68, 68, 0.35);">
    <span style="font-size: 1.75rem;">🚨</span>
  </div>
  <div style="flex: 1;">
    <h4 style="margin: 0 0 0.5rem; font-size: 1.15rem; font-weight: 800; color: #fca5a5; letter-spacing: -0.01em;">${title}</h4>
    <p style="margin: 0; color: #fecaca; line-height: 1.75; font-size: 1.05rem;">${content}</p>
  </div>
</div>`;
}

export function generateUltraPremiumExpertQuote(quote: string, expert: string, credentials: string): string {
  return `
<blockquote class="sota-expert-quote-ultra" style="${ULTRA_PREMIUM_STYLES.expertQuote}">
  <div style="position: absolute; top: 1.5rem; left: 1.5rem; font-size: 4rem; font-family: Georgia, serif; color: rgba(139, 92, 246, 0.4); line-height: 1;">"</div>
  <p style="font-size: 1.2rem; font-style: italic; color: #e2e8f0; line-height: 1.85; margin: 0 0 1.25rem; position: relative; z-index: 1;">${quote}</p>
  <footer style="display: flex; align-items: center; gap: 1rem;">
    <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);">
      <span style="font-size: 1.25rem;">🎓</span>
    </div>
    <div>
      <strong style="color: #a78bfa; font-size: 1rem; display: block;">${expert}</strong>
      <span style="color: #94a3b8; font-size: 0.9rem;">${credentials}</span>
    </div>
  </footer>
</blockquote>`;
}

export function generateUltraPremiumComparisonTable(
  headers: string[],
  rows: Array<{ cells: string[]; highlight?: number }>
): string {
  const headerHtml = headers.map((h, i) => `
    <th style="padding: 1.25rem 1.5rem; text-align: ${i === 0 ? 'left' : 'center'}; font-weight: 800; color: #ffffff; font-size: 1rem; letter-spacing: -0.01em; border-bottom: 2px solid rgba(255,255,255,0.15);">${h}</th>
  `).join('');

  const rowsHtml = rows.map((row, idx) => {
    const bgColor = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'transparent';
    const cellsHtml = row.cells.map((cell, cellIdx) => {
      const isHighlighted = row.highlight === cellIdx;
      let cellStyle = `padding: 1.25rem 1.5rem; color: #e2e8f0; font-size: 0.95rem; `;
      if (cellIdx === 0) cellStyle += 'font-weight: 600; text-align: left;';
      else cellStyle += 'text-align: center;';
      if (isHighlighted) cellStyle += 'background: rgba(34, 197, 94, 0.1);';
      return `<td style="${cellStyle}">${cell}</td>`;
    }).join('');
    return `<tr style="background: ${bgColor}; border-bottom: 1px solid rgba(71, 85, 105, 0.3);">${cellsHtml}</tr>`;
  }).join('');

  return `
<div class="sota-table-ultra" style="${ULTRA_PREMIUM_STYLES.table}">
  <table style="width: 100%; border-collapse: collapse; background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%);">
    <thead>
      <tr style="background: linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #ec4899 100%);">
        ${headerHtml}
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</div>`;
}

export function generateUltraPremiumYouTubeSection(video: YouTubeSearchResult): string {
  return `
<div class="sota-youtube-ultra" style="${ULTRA_PREMIUM_STYLES.youtubeSection}">
  <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.75rem; padding-bottom: 1.25rem; border-bottom: 1px solid rgba(99, 102, 241, 0.2);">
    <div style="display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 14px; box-shadow: 0 8px 25px rgba(239, 68, 68, 0.35);">
      <span style="font-size: 1.5rem;">▶</span>
    </div>
    <div>
      <h3 style="margin: 0; font-size: 1.35rem; font-weight: 800; color: #f1f5f9; letter-spacing: -0.02em;">Helpful Video Guide</h3>
      <p style="margin: 0.25rem 0 0; font-size: 0.9rem; color: #94a3b8;">Watch this for a visual walkthrough</p>
    </div>
  </div>
  <div style="border-radius: 16px; overflow: hidden; box-shadow: 0 15px 50px rgba(0, 0, 0, 0.4);">
    <div style="position: relative; padding-bottom: 56.25%; height: 0;">
      <iframe
        src="https://www.youtube.com/embed/${video.videoId}?rel=0&modestbranding=1"
        title="${video.title.replace(/"/g, '&quot;')}"
        frameborder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy"
        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
      ></iframe>
    </div>
  </div>
  <div style="margin-top: 1.25rem; padding: 1rem 1.25rem; background: rgba(255, 255, 255, 0.03); border-radius: 12px;">
    <p style="margin: 0; color: #cbd5e1; font-size: 0.95rem; line-height: 1.6;">
      <strong style="color: #e2e8f0;">${video.title}</strong>
      ${video.channel ? `<br><span style="color: #94a3b8; font-size: 0.85rem;">by ${video.channel}</span>` : ''}
    </p>
  </div>
</div>`;
}

export function generateUltraPremiumFAQ(faqs: Array<{ q: string; a: string }>): string {
  const faqItems = faqs.map((faq, i) => `
    <details style="margin-bottom: 0.875rem; background: linear-gradient(145deg, rgba(30, 41, 59, 0.6) 0%, rgba(15, 23, 42, 0.8) 100%); border-radius: 14px; border: 1px solid rgba(59, 130, 246, 0.15); overflow: hidden; transition: all 0.3s ease;">
      <summary style="padding: 1.35rem 1.75rem; cursor: pointer; font-weight: 700; color: #f1f5f9; list-style: none; font-size: 1.05rem; display: flex; justify-content: space-between; align-items: center; line-height: 1.5;">
        <span style="display: flex; align-items: center; gap: 0.75rem;">
          <span style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 8px; font-size: 0.85rem; font-weight: 700; color: white;">${i + 1}</span>
          ${faq.q}
        </span>
        <span style="color: #60a5fa; font-size: 1.25rem; transition: transform 0.3s ease;">▼</span>
      </summary>
      <div style="padding: 0 1.75rem 1.5rem 3.75rem; color: #cbd5e1; line-height: 1.85; font-size: 1rem;">
        ${faq.a}
      </div>
    </details>
  `).join('');

  return `
<div class="sota-faq-ultra" style="${ULTRA_PREMIUM_STYLES.faqSection}" itemscope itemtype="https://schema.org/FAQPage">
  <div style="text-align: center; margin-bottom: 2.5rem;">
    <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 18px; margin-bottom: 1rem; box-shadow: 0 12px 35px rgba(59, 130, 246, 0.35);">
      <span style="font-size: 2rem;">❓</span>
    </div>
    <h2 style="font-size: 2rem; font-weight: 900; color: #f1f5f9; margin: 0; letter-spacing: -0.03em;">Frequently Asked Questions</h2>
    <p style="color: #94a3b8; margin: 0.75rem 0 0; font-size: 1rem;">Quick answers to common questions</p>
  </div>
  ${faqItems}
</div>`;
}

export function generateUltraPremiumConclusion(summary: string, actionStep: string): string {
  return `
<div class="sota-conclusion-ultra" style="${ULTRA_PREMIUM_STYLES.conclusion}">
  <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #22c55e, #10b981, #14b8a6);"></div>
  <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.75rem;">
    <div style="display: flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: linear-gradient(135deg, #22c55e, #16a34a); border-radius: 16px; box-shadow: 0 10px 30px rgba(34, 197, 94, 0.4);">
      <span style="font-size: 1.75rem;">🎯</span>
    </div>
    <h2 style="font-size: 1.75rem; font-weight: 900; color: #ffffff; margin: 0; letter-spacing: -0.02em;">The Bottom Line</h2>
  </div>
  <p style="color: #dcfce7; line-height: 1.85; font-size: 1.1rem; margin-bottom: 2rem;">${summary}</p>
  <div style="background: rgba(255, 255, 255, 0.1); padding: 1.5rem 2rem; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.15);">
    <p style="margin: 0; color: #ffffff; font-weight: 700; font-size: 1.15rem; display: flex; align-items: flex-start; gap: 0.75rem;">
      <span style="font-size: 1.5rem;">👉</span>
      <span><strong>Your Next Step:</strong> ${actionStep}</span>
    </p>
  </div>
</div>`;
}

export function generateUltraPremiumStatBox(stats: Array<{ value: string; label: string }>): string {
  const statItems = stats.map(stat => `
    <div style="text-align: center; padding: 1.75rem; background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%); border-radius: 16px; border: 2px solid rgba(59, 130, 246, 0.25); box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2);">
      <div style="font-size: 2.75rem; font-weight: 900; background: linear-gradient(135deg, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; line-height: 1.1;">${stat.value}</div>
      <div style="font-size: 0.9rem; color: #94a3b8; margin-top: 0.5rem; font-weight: 500;">${stat.label}</div>
    </div>
  `).join('');

  return `<div class="sota-stats-ultra" style="${ULTRA_PREMIUM_STYLES.statHighlight}">${statItems}</div>`;
}

export function generateUltraPremiumSteps(steps: Array<{ title: string; content: string }>): string {
  const stepItems = steps.map((step, i) => `
    <div style="display: flex; gap: 1.5rem; padding: 1.5rem 0; ${i < steps.length - 1 ? 'border-bottom: 1px solid rgba(59, 130, 246, 0.15);' : ''}">
      <div style="width: 52px; height: 52px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; font-size: 1.35rem; font-weight: 900; border-radius: 16px; flex-shrink: 0; box-shadow: 0 8px 25px rgba(59, 130, 246, 0.35);">${i + 1}</div>
      <div style="flex: 1;">
        <h4 style="margin: 0 0 0.5rem; font-size: 1.15rem; font-weight: 800; color: #f1f5f9; letter-spacing: -0.01em;">${step.title}</h4>
        <p style="margin: 0; color: #cbd5e1; line-height: 1.75; font-size: 1rem;">${step.content}</p>
      </div>
    </div>
  `).join('');

  return `
<div class="sota-steps-ultra" style="${ULTRA_PREMIUM_STYLES.stepContainer}">
  <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 2px solid rgba(59, 130, 246, 0.2);">
    <div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6, #2563eb); border-radius: 14px; box-shadow: 0 6px 20px rgba(59, 130, 246, 0.35);">
      <span style="font-size: 1.35rem;">📋</span>
    </div>
    <h3 style="margin: 0; font-size: 1.35rem; font-weight: 800; color: #f1f5f9;">Step-by-Step Process</h3>
  </div>
  ${stepItems}
</div>`;
}

export async function injectYouTubeVideo(
  html: string,
  keyword: string,
  serperApiKey: string
): Promise<{ html: string; video: YouTubeSearchResult | null }> {
  if (!serperApiKey) {
    console.warn('[YouTubeInjection] No Serper API key - skipping YouTube video injection');
    return { html, video: null };
  }

  // CRITICAL: Check if YouTube video already exists to prevent duplicates
  const existingYouTubePatterns = [
    /youtube\.com\/embed\//i,
    /class="[^"]*youtube[^"]*"/i,
    /class="[^"]*sota-youtube[^"]*"/i,
    /wp-block-embed-youtube/i
  ];
  
  for (const pattern of existingYouTubePatterns) {
    if (pattern.test(html)) {
      console.log('[YouTubeInjection] YouTube video already exists - skipping to prevent duplicate');
      return { html, video: null };
    }
  }

  console.log(`[YouTubeInjection] Searching for video: "${keyword}"`);

  try {
    const videos = await searchYouTubeVideos(keyword, serperApiKey, 3);
    if (videos.length === 0) {
      console.warn(`[YouTubeInjection] No videos found for "${keyword}"`);
      return { html, video: null };
    }

    const video = videos[0];
    console.log(`[YouTubeInjection] ✅ Found: "${video.title}" by ${video.channel}`);

    const youtubeHtml = generateUltraPremiumYouTubeSection(video);

    // Strategy 1: Replace placeholder if exists
    if (html.includes('[YOUTUBE_VIDEO_PLACEHOLDER]')) {
      console.log('[YouTubeInjection] Replaced placeholder');
      return {
        html: html.replace('[YOUTUBE_VIDEO_PLACEHOLDER]', youtubeHtml),
        video
      };
    }

    // Strategy 2: Insert after 2nd H2 (middle of content)
    const h2Regex = /<\/h2>/gi;
    const h2Matches = Array.from(html.matchAll(h2Regex));

    if (h2Matches.length >= 2) {
      const insertIndex = h2Matches[1].index! + h2Matches[1][0].length;

      // Find the next closing paragraph tag after the H2
      const afterH2 = html.substring(insertIndex);
      const nextPMatch = afterH2.match(/<\/p>/i);

      if (nextPMatch && nextPMatch.index !== undefined) {
        const finalInsertPos = insertIndex + nextPMatch.index + nextPMatch[0].length;
        const result = html.substring(0, finalInsertPos) + '\n\n' + youtubeHtml + '\n\n' + html.substring(finalInsertPos);
        console.log('[YouTubeInjection] Inserted after 2nd H2 section');
        return { html: result, video };
      }
    }

    // Strategy 3: Insert after 1st H2 if only 1 exists
    if (h2Matches.length >= 1) {
      const insertIndex = h2Matches[0].index! + h2Matches[0][0].length;
      const afterH2 = html.substring(insertIndex);
      const nextPMatch = afterH2.match(/<\/p>/i);

      if (nextPMatch && nextPMatch.index !== undefined) {
        const finalInsertPos = insertIndex + nextPMatch.index + nextPMatch[0].length;
        const result = html.substring(0, finalInsertPos) + '\n\n' + youtubeHtml + '\n\n' + html.substring(finalInsertPos);
        console.log('[YouTubeInjection] Inserted after 1st H2 section');
        return { html: result, video };
      }
    }

    // Strategy 4: Insert before FAQ section if exists
    const faqMatch = html.match(/<div[^>]*class="[^"]*faq[^"]*"[^>]*>/i);
    if (faqMatch && faqMatch.index !== undefined) {
      const result = html.substring(0, faqMatch.index) + youtubeHtml + '\n\n' + html.substring(faqMatch.index);
      console.log('[YouTubeInjection] Inserted before FAQ section');
      return { html: result, video };
    }

    // Strategy 5: Insert in the middle (50% through content)
    const middlePoint = Math.floor(html.length / 2);
    const nearMiddle = html.substring(middlePoint);
    const middlePMatch = nearMiddle.match(/<\/p>/i);

    if (middlePMatch && middlePMatch.index !== undefined) {
      const finalInsertPos = middlePoint + middlePMatch.index + middlePMatch[0].length;
      const result = html.substring(0, finalInsertPos) + '\n\n' + youtubeHtml + '\n\n' + html.substring(finalInsertPos);
      console.log('[YouTubeInjection] Inserted at content midpoint');
      return { html: result, video };
    }

    // Strategy 6: Last resort - append before any conclusion/final section
    const conclusionMatch = html.match(/<h2[^>]*>.*?(conclusion|final|summary|wrap).*?<\/h2>/i);
    if (conclusionMatch && conclusionMatch.index !== undefined) {
      const result = html.substring(0, conclusionMatch.index) + youtubeHtml + '\n\n' + html.substring(conclusionMatch.index);
      console.log('[YouTubeInjection] Inserted before conclusion');
      return { html: result, video };
    }

    // Strategy 7: Absolute fallback - append to end (but before references if they exist)
    console.log('[YouTubeInjection] Appended to end of content');
    return {
      html: html + '\n\n' + youtubeHtml,
      video
    };
  } catch (error: any) {
    console.error('[YouTubeInjection] FAILED:', error.message);
    return { html, video: null };
  }
}

export async function enhanceContentFully(
  html: string,
  keyword: string,
  availablePages: InternalPage[],
  config: Partial<EnhancementConfig> = {}
): Promise<{
  html: string;
  stats: {
    linksAdded: number;
    youtubeAdded: boolean;
    componentsEnhanced: number;
  };
}> {
  const fullConfig = { ...DEFAULT_ENHANCEMENT_CONFIG, ...config };
  let enhancedHtml = html;
  let youtubeAdded = false;
  let linksAdded = 0;

  if (fullConfig.injectYouTube && fullConfig.serperApiKey) {
    const youtubeResult = await injectYouTubeVideo(enhancedHtml, keyword, fullConfig.serperApiKey);
    enhancedHtml = youtubeResult.html;
    youtubeAdded = youtubeResult.video !== null;
  }

  if (availablePages.length > 0 && fullConfig.baseUrl) {
    const linkResult = processContentWithInternalLinks(
      enhancedHtml,
      availablePages,
      fullConfig.baseUrl,
      {
        minLinksPerPost: 4,
        maxLinksPerPost: 8,
        minAnchorWords: 4,
        maxAnchorWords: 7,
        maxLinksPerParagraph: 1,
        minWordsBetweenLinks: 150,
        avoidFirstParagraph: true,
        avoidLastParagraph: true
      }
    );
    enhancedHtml = linkResult.html;
    linksAdded = linkResult.stats.successful;
  }

  return {
    html: enhancedHtml,
    stats: {
      linksAdded,
      youtubeAdded,
      componentsEnhanced: 0
    }
  };
}

export default {
  enhanceContentFully,
  injectYouTubeVideo,
  generateUltraPremiumKeyTakeaways,
  generateUltraPremiumProTip,
  generateUltraPremiumWarning,
  generateUltraPremiumExpertQuote,
  generateUltraPremiumComparisonTable,
  generateUltraPremiumYouTubeSection,
  generateUltraPremiumFAQ,
  generateUltraPremiumConclusion,
  generateUltraPremiumStatBox,
  generateUltraPremiumSteps,
  ULTRA_PREMIUM_STYLES
};
