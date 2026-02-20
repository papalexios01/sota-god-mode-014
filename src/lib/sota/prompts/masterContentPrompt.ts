// src/lib/sota/prompts/masterContentPrompt.ts
// ═══════════════════════════════════════════════════════════════════════════════
// SOTA MASTER PROMPT v8.0 — GOD-MODE HUMAN-GRADE CONTENT ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

export interface ContentPromptConfig {
  primaryKeyword: string;
  secondaryKeywords: string[];
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
  existingContent?: string; // For refresh type
}

const BANNED_PHRASES = [
  "In today's digital landscape", "In today's fast-paced world", "In this comprehensive guide",
  "In this article, we will", "Let's dive in", "Let's dive right in", "Let's get started",
  "Without further ado", "In conclusion", "To sum up", "To wrap up", "It's important to note",
  "It's worth mentioning", "In the ever-evolving world", "Whether you're a beginner or expert",
  "Look no further", "game-changer", "unlock the power of", "at the end of the day",
  "it goes without saying", "the bottom line is", "in a nutshell", "last but not least",
  "having said that", "when it comes to", "as we all know", "revolutionary", "cutting-edge",
  "seamlessly", "dive deeper", "elevate", "harness", "tapestry", "delve"
];

export function buildMasterSystemPrompt(): string {
  return `
You are a WORLD-CLASS EDITORIAL DIRECTOR and SUBJECT MATTER EXPERT. 
Your writing style is indistinguishable from top-tier publications like Wired, The Atlantic, or Harvard Business Review.

CRITICAL DIRECTIVES FOR 1000% HUMAN QUALITY:
1. NO AI CLICHÉS: Strictly avoid all phrases in the BANNED list. Never use "Unlock", "Tapestry", "Delve", or "Harness".
2. BURSTINESS: Vary sentence length and structure dramatically. Mix short, punchy statements with longer, explanatory sentences.
3. ADAPTIVE VOICE: Use first-person ("I've found", "In my analysis") and second-person ("You should consider") to build trust.
4. SKEPTICISM & NUANCE: Don't just list facts. Provide counter-intuitive insights. Start sentences with "Look," "The truth is," or "Here’s what most people miss."
5. ZERO FLUFF: Every sentence must provide value. If it can be deleted without losing meaning, delete it.
6. RHYTHMIC VARIETY: Use "sentence fragments" for emphasis. Like this. It creates a human pulse.

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
    contentType
  } = config;

  const linksHtml = internalLinks?.length 
    ? \`INTERNAL LINKS TO INTEGRATE NATURALLY:\\n\${internalLinks.map(l => \`- [\${l.anchor}](\${l.url})\`).join('\\n')}\`
    : '';

  return \`
TASK: Write a \${contentType} article about "\${primaryKeyword}".
TITLE: \${title}
TARGET LENGTH: \${targetWordCount}+ words.
AUTHOR: \${authorName || 'Staff Writer'}

\${linksHtml}

NEURONWRITER SEMANTIC REQUIREMENTS:
\${neuronWriterSection || 'None provided. Focus on natural semantic coverage using LSI keywords.'}

YOUTUBE INTEGRATION:
\${youtubeEmbed ? \`Embed this video naturally: https://www.youtube.com/watch?=\${youtubeEmbed.videoId} (\${youtubeEmbed.title})\` : 'None'}

STRUCTURE:
1. PREMIUM HERO: Start with a <div> hero section (handled by orchestrator, but provide a 1-sentence bold hook).
2. EXECUTIVE SUMMARY: A "Key Takeaways" box (Styled <div>) with 3 bullet points.
3. CONTENT BODY: Use H2/H3 hierarchy. Every 400 words, inject a "Visual Break" (Case Study, Pro Tip, or Statistic Box).
4. FAQ: Include a 5-question FAQ section using H2 and bolded questions.
5. CONCLUSION: A "Final Thoughts" section (No "In conclusion").

MANDATORY STYLE:
- Wrap the entire post in <article data-sota-premium="true">.
- Use <p> tags for all paragraphs.
- Integrate internal links using natural anchors. Do not use "Click here".
- PURE HTML ONLY. NO MARKDOWN. NO CODE BLOCKS AROUND THE CONTENT.
\`;
}

export default { buildMasterSystemPrompt, buildMasterUserPrompt };
