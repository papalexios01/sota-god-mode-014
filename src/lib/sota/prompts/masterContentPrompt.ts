// src/lib/sota/prompts/masterContentPrompt.ts
// ═══════════════════════════════════════════════════════════════════════════════
// SOTA MASTER PROMPT v9.0 — GOD-MODE HUMAN-GRADE CONTENT ENGINE
// Updated: Full NeuronWriter integration — basic terms, extended terms,
//          entities, and headings all used in generation for >90 NW/SEO score
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContentPromptConfig {
  primaryKeyword: string;
  secondaryKeywords?: string[];
  title: string;
  seoTitle?: string;
  metaDescription?: string;
  contentType: "pillar" | "cluster" | "single" | "refresh";
  targetWordCount: number;
  neuronWriterSection?: string;
  internalLinks?: { anchor: string; url: string }[];
  serpData?: {
    competitorTitles: string[];
    peopleAlsoAsk: string[];
    avgWordCount: number;
  };
  youtubeEmbed?: { videoId: string; title: string };
  tone?: string;
  targetAudience?: string;
  authorName?: string;
  existingContent?: string;
}

const BANNED_PHRASES = [
  "In today's digital landscape", "In today's fast-paced world", "In this comprehensive guide",
  "In this article, we will", "Let's dive in", "Let's dive right in", "Let's get started",
  "Without further ado", "In conclusion", "To sum up", "To wrap up", "It's important to note",
  "It's worth mentioning", "In the ever-evolving world", "Whether you're a beginner or expert",
  "Look no further", "game-changer", "unlock the power of", "at the end of the day",
  "it goes without saying", "the bottom line is", "in a nutshell", "last but not least",
  "having said that", "when it comes to", "as we all know", "revolutionary",
  "cutting-edge", "seamlessly", "dive deeper", "elevate", "harness", "tapestry", "delve"
];

export function buildMasterSystemPrompt(): string {
  return `
You are a WORLD-CLASS EDITORIAL DIRECTOR, SEO EXPERT, and SUBJECT MATTER EXPERT.
Your writing style is indistinguishable from top-tier publications like Wired, The Atlantic, or Harvard Business Review.

CRITICAL DIRECTIVES FOR 100% HUMAN QUALITY:
1. NO AI CLICHÉS: Strictly avoid all phrases in the BANNED list. Never use "Unlock", "Tapestry", "Delve", or "Harness".
2. BURSTINESS: Vary sentence length and structure dramatically. Mix short, punchy statements with longer, explanatory sentences.
3. ADAPTIVE VOICE: Use first-person ("I've found", "In my analysis") and second-person ("You should consider") to build trust.
4. SKEPTICISM & NUANCE: Don't just list facts. Provide counter-intuitive insights. Start sentences with "Look,", "The truth is,", or "Here's what most people miss."
5. ZERO FLUFF: Every sentence must provide value. If it can be deleted without losing meaning, delete it.
6. RHYTHMIC VARIETY: Use "sentence fragments" for emphasis. Like this. It creates a human pulse.

NEURONWRITER COMPLIANCE (CRITICAL — this is a scored metric):
- Every keyword listed under "BASIC KEYWORDS" MUST appear in the content at the specified frequency.
- Every keyword listed under "EXTENDED KEYWORDS" should appear naturally — aim for 80%+ coverage.
- Every entity listed under "NAMED ENTITIES" must be referenced in context at least once.
- Structure your H2/H3 headings to cover the topics shown in competitor heading suggestions.
- Failure to include these terms will result in a score BELOW 90 — this is unacceptable.

HTML ARCHITECTURE (ULTRA-PREMIUM):
- Use semantic HTML5: <article>, <section>, <aside>.
- Use <div> tags with inline styles for "Visual Breaks" (Pro Tips, Warnings, Key Takeaways).
- Style: #f8fafc background, 4px left-border (blue/gold/green), 20px padding.
- Headings: H2 and H3 only. Never H1.
- Data: Use <table> with <thead> and <tbody> for any comparative data.
- Quotes: Use <blockquote> with styled <cite> tags.
`;
}

export function buildMasterUserPrompt(config: ContentPromptConfig): string {
  const {
    primaryKeyword,
    title,
    targetWordCount,
    neuronWriterSection,
    internalLinks,
    youtubeEmbed,
    authorName,
    contentType,
  } = config;

  // Safe string construction for internal links
  let linksHtml = '';
  if (internalLinks && internalLinks.length > 0) {
    const linkItems = internalLinks.map(l => `- [${l.anchor}](${l.url})`).join('\n');
    linksHtml = `INTERNAL LINKS TO INTEGRATE NATURALLY:\n${linkItems}`;
  }

  const hasNeuronData = neuronWriterSection && !neuronWriterSection.includes('No NeuronWriter');

  return `
TASK: Write a ${contentType} article about "${primaryKeyword}".
TITLE: ${title}
TARGET LENGTH: ${targetWordCount}+ words. (If NeuronWriter recommended a specific length, match or exceed it.)
AUTHOR: ${authorName || 'Staff Writer'}

${linksHtml}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEURONWRITER SEO OPTIMIZATION DATA (USE ALL OF IT):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${neuronWriterSection || 'No NeuronWriter data. Use comprehensive LSI keyword coverage.'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

YOUTUBE INTEGRATION:
${youtubeEmbed ? `Embed this video naturally: https://www.youtube.com/watch?v=${youtubeEmbed.videoId} (${youtubeEmbed.title})` : 'None'}

MANDATORY ARTICLE STRUCTURE:
1. EXECUTIVE SUMMARY: A styled "Key Takeaways" box (styled <div>) with 5 bullet points summarizing the most important insights.
2. INTRODUCTION: 200-300 words. Hook the reader with a surprising fact or contrarian statement. NO clichés.
3. CONTENT BODY: 
   - Use H2 headings for major sections (minimum 6 H2s)
   - Use H3 headings for subsections under each H2
   - Every 300-400 words, inject a styled "Visual Break" (<div> with inline styles): Pro Tip, Case Study, Key Insight, or Reality Check
   - Include at least 2 comparison tables using <table>/<thead>/<tbody>
   - Include at least 2 numbered <ol> or bulleted <ul> lists
   - Include at least 1 <blockquote> with an expert quote
4. FAQ SECTION: 7 frequently asked questions using H2 heading "Frequently Asked Questions" and <details>/<summary> accordion elements
5. CONCLUSION: "Final Verdict" or "Bottom Line" section — specific, actionable, no fluff

${hasNeuronData ? `
KEYWORD INTEGRATION CHECKLIST (you MUST do ALL of these):
✅ Verify every BASIC keyword appears at its recommended frequency
✅ Integrate as many EXTENDED keywords as possible (target 80%+ coverage)
✅ Reference every NAMED ENTITY at least once naturally
✅ Cover the main topics from competitor heading suggestions
✅ Write enough content to exceed the recommended word count
✅ Keep keyword density natural — never obvious keyword stuffing
` : ''}

BANNED PHRASES (NEVER USE):
${BANNED_PHRASES.join(', ')}

OUTPUT RULES:
- Wrap the entire article in <article>.
- Use <p> tags for all paragraphs.
- Use natural anchor text for internal links. Never "Click here" or "Read more".
- PURE HTML ONLY. NO MARKDOWN. NO CODE BLOCKS. NO BACKTICKS AROUND THE CONTENT.
- Start the content directly with the article tag. No preamble.
`;
}

export default { buildMasterSystemPrompt, buildMasterUserPrompt };
