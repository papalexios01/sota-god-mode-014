// =============================================================================
// SOTA PREMIUM DESIGN SYSTEM v1.0 - Enterprise-Grade Content Theming
// =============================================================================

export interface PremiumTheme {
  id: string;
  name: string;
  styles: {
    container: string;
    heading: string;
    paragraph: string;
    keyTakeaways: string;
    comparisonTable: string;
    faqAccordion: string;
    quoteBlock: string;
  };
}

export const PREMIUM_THEMES: PremiumTheme[] = [
  {
    id: 'glassmorphism-dark',
    name: 'Glassmorphism Dark',
    styles: {
      container: 'background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #f1f5f9; border-radius: 20px; padding: 2rem;',
      heading: 'color: #f1f5f9; font-weight: 800; margin-bottom: 1rem;',
      paragraph: 'color: #cbd5e1; line-height: 1.8; margin-bottom: 1.5rem;',
      keyTakeaways: 'background: linear-gradient(145deg, #0c1426 0%, #1a2744 100%); border: 2px solid rgba(59, 130, 246, 0.4); border-radius: 20px; padding: 2rem;',
      comparisonTable: 'background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%); border-radius: 16px; overflow: hidden;',
      faqAccordion: 'background: #1e293b; border-radius: 12px; border: 1px solid #475569;',
      quoteBlock: 'background: linear-gradient(145deg, #0f172a 0%, #1e293b 100%); border-left: 5px solid #8b5cf6; border-radius: 16px; padding: 2rem;'
    }
  },
  {
    id: 'clean-light',
    name: 'Clean Light',
    styles: {
      container: 'background: #ffffff; color: #1e293b; border-radius: 16px; padding: 2rem;',
      heading: 'color: #0f172a; font-weight: 700; margin-bottom: 1rem;',
      paragraph: 'color: #475569; line-height: 1.8; margin-bottom: 1.5rem;',
      keyTakeaways: 'background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 16px; padding: 2rem;',
      comparisonTable: 'background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;',
      faqAccordion: 'background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0;',
      quoteBlock: 'background: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 12px; padding: 1.5rem;'
    }
  },
  {
    id: 'enterprise-blue',
    name: 'Enterprise Blue',
    styles: {
      container: 'background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%); color: #f1f5f9; border-radius: 20px; padding: 2rem;',
      heading: 'color: #60a5fa; font-weight: 800; margin-bottom: 1rem;',
      paragraph: 'color: #cbd5e1; line-height: 1.8; margin-bottom: 1.5rem;',
      keyTakeaways: 'background: rgba(59, 130, 246, 0.1); border: 2px solid rgba(59, 130, 246, 0.3); border-radius: 16px; padding: 2rem;',
      comparisonTable: 'background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%); border-radius: 16px; overflow: hidden;',
      faqAccordion: 'background: rgba(59, 130, 246, 0.05); border-radius: 12px; border: 1px solid rgba(59, 130, 246, 0.2);',
      quoteBlock: 'background: rgba(59, 130, 246, 0.1); border-left: 5px solid #3b82f6; border-radius: 16px; padding: 2rem;'
    }
  }
];

/**
 * Generate HTML for Key Takeaways box
 */
export const generateKeyTakeawaysHTML = (takeaways: string[], themeId: string = 'glassmorphism-dark'): string => {
  const theme = PREMIUM_THEMES.find(t => t.id === themeId) || PREMIUM_THEMES[0];
  
  const items = takeaways.map((item, i) => `
    <li style="padding: 1rem 0; display: flex; gap: 1rem; align-items: flex-start; border-bottom: 1px solid rgba(255, 255, 255, 0.08); line-height: 1.75;">
      <span style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; background: linear-gradient(135deg, #22c55e, #16a34a); border-radius: 50%; flex-shrink: 0; font-weight: 700; font-size: 0.85rem; color: white;">${i + 1}</span>
      <span style="color: inherit;">${item}</span>
    </li>
  `).join('');

  return `
<div class="sota-key-takeaways" style="${theme.keyTakeaways}">
  <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 1.75rem; padding-bottom: 1.25rem; border-bottom: 2px solid rgba(59, 130, 246, 0.25);">
    <div style="display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; background: linear-gradient(135deg, #3b82f6, #8b5cf6); border-radius: 14px;">
      <span style="font-size: 1.75rem;">⚡</span>
    </div>
    <div>
      <h3 style="margin: 0; font-size: 1.5rem; font-weight: 800; color: inherit;">Key Takeaways</h3>
      <p style="margin: 0.25rem 0 0; font-size: 0.9rem; opacity: 0.7;">Save this for quick reference</p>
    </div>
  </div>
  <ul style="list-style: none; padding: 0; margin: 0;">
    ${items}
  </ul>
</div>`;
};

/**
 * Generate HTML for Pro Tip callout
 */
export const generateProTipHTML = (title: string, content: string): string => {
  return `
<div class="sota-pro-tip" style="display: flex; gap: 1.25rem; padding: 2rem; background: linear-gradient(145deg, #052e16 0%, #14532d 100%); border-radius: 16px; margin: 2rem 0; border-left: 5px solid #22c55e;">
  <div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: linear-gradient(135deg, #22c55e, #16a34a); border-radius: 12px; flex-shrink: 0;">
    <span style="font-size: 1.5rem;">💎</span>
  </div>
  <div style="flex: 1;">
    <h4 style="margin: 0 0 0.5rem; font-size: 1.1rem; font-weight: 700; color: #4ade80;">${title}</h4>
    <p style="margin: 0; color: #bbf7d0; line-height: 1.7;">${content}</p>
  </div>
</div>`;
};

/**
 * Generate HTML for Warning callout
 */
export const generateWarningHTML = (title: string, content: string): string => {
  return `
<div class="sota-warning" style="display: flex; gap: 1.25rem; padding: 2rem; background: linear-gradient(145deg, #450a0a 0%, #7f1d1d 100%); border-radius: 16px; margin: 2rem 0; border-left: 5px solid #ef4444;">
  <div style="display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 12px; flex-shrink: 0;">
    <span style="font-size: 1.5rem;">🚨</span>
  </div>
  <div style="flex: 1;">
    <h4 style="margin: 0 0 0.5rem; font-size: 1.1rem; font-weight: 700; color: #fca5a5;">${title}</h4>
    <p style="margin: 0; color: #fecaca; line-height: 1.7;">${content}</p>
  </div>
</div>`;
};

export default {
  PREMIUM_THEMES,
  generateKeyTakeawaysHTML,
  generateProTipHTML,
  generateWarningHTML
};
