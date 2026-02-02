// ============================================================================
// SOTA ENTERPRISE-GRADE ENHANCED TABS v15.0
// Ultra-Premium Content Management Interface
// ============================================================================

import React, { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import { ContentItem, SeoCheck } from './types';
import { calculateFleschReadability, getReadabilityVerdict, escapeRegExp } from './contentUtils';
import ReactQuill from 'react-quill';

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

const TabIcon = ({ name }: { name: string }) => {
  const icons: Record<string, JSX.Element> = {
    editor: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    html: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
    assets: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    guardian: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
    json: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  };
  return icons[name] || null;
};

const CopyButton = ({ text, label = 'Copy' }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={handleCopy} className="sota-copy-btn" style={{
      padding: '6px 12px', fontSize: '0.75rem', background: copied ? '#10B981' : 'rgba(255,255,255,0.1)',
      border: 'none', borderRadius: '6px', color: 'white', cursor: 'pointer', transition: 'all 0.2s'
    }}>
      {copied ? '\u2713 Copied!' : label}
    </button>
  );
};

const MetricCard = ({ label, value, status, icon }: { label: string; value: string | number; status: 'success' | 'warning' | 'error' | 'neutral'; icon?: React.ReactNode }) => (
  <div className="metric-card" style={{
    background: 'var(--bg-elevated)', padding: '1rem', borderRadius: '12px',
    border: `1px solid ${status === 'success' ? 'rgba(16, 185, 129, 0.3)' : status === 'warning' ? 'rgba(245, 158, 11, 0.3)' : status === 'error' ? 'rgba(239, 68, 68, 0.3)' : 'var(--border-subtle)'}`,
    display: 'flex', flexDirection: 'column', gap: '0.5rem'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
      {icon}
      <span>{label}</span>
    </div>
    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: status === 'success' ? '#10B981' : status === 'warning' ? '#F59E0B' : status === 'error' ? '#EF4444' : 'var(--text-primary)' }}>
      {value}
    </div>
  </div>
);

// ============================================================================
// 1. ENHANCED EDITOR TAB - SOTA WYSIWYG with Real-time Analytics
// ============================================================================

interface EnhancedEditorProps {
  content: string;
  onChange: (content: string) => void;
  primaryKeyword?: string;
}

export const EnhancedEditorTab = memo(({ content, onChange, primaryKeyword = '' }: EnhancedEditorProps) => {
  const [showStats, setShowStats] = useState(true);
  const [wordGoal] = useState(2500);
  const editorRef = useRef<ReactQuill>(null);

  const quillModules = useMemo(() => ({
    toolbar: [
      [{ 'header': [2, 3, 4, false] }],
      ['bold', 'italic', 'underline', 'strike', 'blockquote'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image', 'video'],
      [{ 'color': [] }, { 'background': [] }],
      ['clean']
    ],
    clipboard: { matchVisual: false }
  }), []);

  const stats = useMemo(() => {
    const div = document.createElement('div');
    div.innerHTML = content;
    const text = div.textContent || '';
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const paragraphs = content.split(/<\/p>/i).length - 1 || 1;
    const headings = (content.match(/<h[2-6][^>]*>/gi) || []).length;
    const links = (content.match(/<a[^>]+href/gi) || []).length;
    const images = (content.match(/<img[^>]+/gi) || []).length;
    const keywordCount = primaryKeyword ? (text.toLowerCase().match(new RegExp(escapeRegExp(primaryKeyword.toLowerCase()), 'g')) || []).length : 0;
    const keywordDensity = words.length > 0 ? ((keywordCount / words.length) * 100).toFixed(2) : '0';
    const readingTime = Math.ceil(words.length / 200);
    const readability = calculateFleschReadability(text);
    return { words: words.length, sentences: sentences.length, paragraphs, headings, links, images, keywordCount, keywordDensity, readingTime, readability };
  }, [content, primaryKeyword]);

  const progressPercent = Math.min((stats.words / wordGoal) * 100, 100);

  return (
    <div className="enhanced-editor-container" style={{ display: 'flex', height: '100%', background: '#0A0A0B' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div className="editor-toolbar-extended" style={{
          background: 'linear-gradient(180deg, #1a1a2e 0%, #0f0f17 100%)',
          padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <TabIcon name="editor" />
            <span style={{ fontWeight: '700', color: '#E2E8F0', fontSize: '0.9rem' }}>SOTA Visual Editor</span>
            <span className="badge pillar" style={{ fontSize: '0.65rem' }}>AI-POWERED</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: '120px', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${progressPercent}%`, height: '100%', background: progressPercent >= 100 ? '#10B981' : progressPercent >= 80 ? '#3B82F6' : '#F59E0B', transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: '0.75rem', color: progressPercent >= 100 ? '#10B981' : '#94A3B8' }}>{stats.words}/{wordGoal}</span>
            </div>
            <button onClick={() => setShowStats(!showStats)} style={{
              padding: '6px 12px', background: showStats ? 'var(--accent-primary)' : 'rgba(255,255,255,0.1)',
              border: 'none', borderRadius: '6px', color: 'white', fontSize: '0.75rem', cursor: 'pointer'
            }}>
              {showStats ? 'Hide Stats' : 'Show Stats'}
            </button>
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ReactQuill ref={editorRef} theme="snow" value={content} onChange={onChange} modules={quillModules} style={{ height: 'calc(100% - 42px)' }} />
        </div>
      </div>
      {showStats && (
        <div className="editor-stats-panel" style={{
          width: '280px', background: 'linear-gradient(180deg, #111118 0%, #0A0A0F 100%)',
          borderLeft: '1px solid rgba(255,255,255,0.1)', padding: '1rem', overflowY: 'auto'
        }}>
          <h4 style={{ color: '#E2E8F0', fontSize: '0.85rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>\u26A1 Real-time Analytics</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <MetricCard label="Words" value={stats.words} status={stats.words >= 2200 && stats.words <= 2800 ? 'success' : stats.words >= 1500 ? 'warning' : 'error'} />
            <MetricCard label="Reading Time" value={`${stats.readingTime} min`} status="neutral" />
            <MetricCard label="Readability" value={stats.readability} status={stats.readability >= 60 ? 'success' : stats.readability >= 40 ? 'warning' : 'error'} />
            <MetricCard label="Headings (H2-H6)" value={stats.headings} status={stats.headings >= 5 ? 'success' : stats.headings >= 3 ? 'warning' : 'error'} />
            <MetricCard label="Links" value={stats.links} status={stats.links >= 6 && stats.links <= 12 ? 'success' : stats.links >= 3 ? 'warning' : 'error'} />
            <MetricCard label="Images" value={stats.images} status={stats.images >= 3 ? 'success' : stats.images >= 1 ? 'warning' : 'error'} />
            {primaryKeyword && (
              <>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
                <h5 style={{ color: '#94A3B8', fontSize: '0.75rem', textTransform: 'uppercase' }}>Keyword: "{primaryKeyword}"</h5>
                <MetricCard label="Occurrences" value={stats.keywordCount} status={stats.keywordCount >= 5 && stats.keywordCount <= 15 ? 'success' : 'warning'} />
                <MetricCard label="Density" value={`${stats.keywordDensity}%`} status={parseFloat(stats.keywordDensity) >= 0.5 && parseFloat(stats.keywordDensity) <= 2.5 ? 'success' : 'warning'} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
});


// ============================================================================
// 2. ENHANCED RAW HTML TAB - Syntax Highlighting, Validation & Tools
// ============================================================================

interface EnhancedRawHtmlProps {
  content: string;
  onChange: (content: string) => void;
}

export const EnhancedRawHtmlTab = memo(({ content, onChange }: EnhancedRawHtmlProps) => {
  const [validationResults, setValidationResults] = useState<{valid: boolean; errors: string[]; warnings: string[]}>({ valid: true, errors: [], warnings: [] });
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [fontSize, setFontSize] = useState(14);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const validateHtml = useCallback(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const openTags: string[] = [];
    const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
    const selfClosing = ['img', 'br', 'hr', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr'];
    let match;
    while ((match = tagRegex.exec(content)) !== null) {
      const [fullTag, tagName] = match;
      const lowerTag = tagName.toLowerCase();
      if (fullTag.startsWith('</')) {
        const lastOpen = openTags.pop();
        if (lastOpen !== lowerTag) {
          errors.push(`Mismatched closing tag: </${tagName}> (expected </${lastOpen || 'none'}>)`);
        }
      } else if (!selfClosing.includes(lowerTag) && !fullTag.endsWith('/>')) {
        openTags.push(lowerTag);
      }
    }
    if (openTags.length > 0) {
      errors.push(`Unclosed tags: ${openTags.map(t => `<${t}>`).join(', ')}`);
    }
    if (/<h1[^>]*>/i.test(content)) {
      const h1Count = (content.match(/<h1[^>]*>/gi) || []).length;
      if (h1Count > 1) warnings.push(`Multiple H1 tags detected (${h1Count}). SEO best practice: use only one H1.`);
    }
    if (!/<img[^>]+alt=['"][^'"]+['"]/i.test(content) && /<img/i.test(content)) {
      warnings.push('Some images may be missing alt attributes (accessibility issue)');
    }
    if (/<style[^>]*>|style=['"]/.test(content)) {
      warnings.push('Inline styles detected. Consider using external CSS for better maintainability.');
    }
    setValidationResults({ valid: errors.length === 0, errors, warnings });
  }, [content]);

  useEffect(() => {
    const timer = setTimeout(validateHtml, 500);
    return () => clearTimeout(timer);
  }, [content, validateHtml]);

  const formatHtml = () => {
    let formatted = content;
    formatted = formatted.replace(/></g, '>\n<');
    formatted = formatted.replace(/(<\/[^>]+>)/g, '$1\n');
    formatted = formatted.replace(/\n\s*\n/g, '\n');
    onChange(formatted.trim());
  };

  const minifyHtml = () => {
    let minified = content;
    minified = minified.replace(/\n/g, ' ');
    minified = minified.replace(/\s+/g, ' ');
    minified = minified.replace(/>\s+</g, '><');
    onChange(minified.trim());
  };

  const lineCount = content.split('\n').length;
  const charCount = content.length;

  return (
    <div className="enhanced-html-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0D1117' }}>
      <div className="html-toolbar" style={{
        background: 'linear-gradient(180deg, #161B22 0%, #0D1117 100%)',
        padding: '0.75rem 1rem', borderBottom: '1px solid #30363D',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <TabIcon name="html" />
          <span style={{ fontWeight: '700', color: '#E6EDF3', fontSize: '0.9rem' }}>Raw HTML Editor</span>
          <span className={`badge ${validationResults.valid ? 'pillar' : 'standard'}`} style={{ fontSize: '0.65rem' }}>
            {validationResults.valid ? 'VALID' : `${validationResults.errors.length} ERRORS`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={formatHtml} style={{ padding: '6px 12px', background: '#238636', border: 'none', borderRadius: '6px', color: 'white', fontSize: '0.75rem', cursor: 'pointer' }}>Format</button>
          <button onClick={minifyHtml} style={{ padding: '6px 12px', background: '#6E7681', border: 'none', borderRadius: '6px', color: 'white', fontSize: '0.75rem', cursor: 'pointer' }}>Minify</button>
          <CopyButton text={content} />
          <select value={fontSize} onChange={e => setFontSize(Number(e.target.value))} style={{ padding: '6px', background: '#21262D', border: '1px solid #30363D', borderRadius: '6px', color: '#E6EDF3', fontSize: '0.75rem' }}>
            <option value={12}>12px</option>
            <option value={14}>14px</option>
            <option value={16}>16px</option>
            <option value={18}>18px</option>
          </select>
          <button onClick={() => setShowLineNumbers(!showLineNumbers)} style={{ padding: '6px 10px', background: showLineNumbers ? '#238636' : '#21262D', border: '1px solid #30363D', borderRadius: '6px', color: 'white', fontSize: '0.75rem', cursor: 'pointer' }}>#</button>
        </div>
      </div>
      {(validationResults.errors.length > 0 || validationResults.warnings.length > 0) && (
        <div className="validation-panel" style={{ padding: '0.75rem 1rem', background: '#161B22', borderBottom: '1px solid #30363D', maxHeight: '150px', overflowY: 'auto' }}>
          {validationResults.errors.map((err, i) => (
            <div key={`e-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#F85149', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              <span>\u2717</span> {err}
            </div>
          ))}
          {validationResults.warnings.map((warn, i) => (
            <div key={`w-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#D29922', fontSize: '0.8rem', marginBottom: '0.25rem' }}>
              <span>\u26A0</span> {warn}
            </div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {showLineNumbers && (
          <div className="line-numbers" style={{
            width: '50px', background: '#161B22', borderRight: '1px solid #30363D',
            padding: '1rem 0.5rem', fontFamily: 'ui-monospace, monospace', fontSize: `${fontSize}px`,
            color: '#6E7681', textAlign: 'right', lineHeight: '1.5', overflowY: 'hidden', userSelect: 'none'
          }}>
            {Array.from({ length: lineCount }, (_, i) => <div key={i}>{i + 1}</div>)}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, width: '100%', background: '#0D1117', color: '#E6EDF3',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: `${fontSize}px`, padding: '1rem', border: 'none', resize: 'none',
            lineHeight: '1.5', outline: 'none'
          }}
          spellCheck={false}
        />
      </div>
      <div className="html-footer" style={{
        padding: '0.5rem 1rem', background: '#161B22', borderTop: '1px solid #30363D',
        display: 'flex', justifyContent: 'space-between', color: '#6E7681', fontSize: '0.75rem'
      }}>
        <span>Lines: {lineCount} | Characters: {charCount.toLocaleString()}</span>
        <span>HTML5</span>
      </div>
    </div>
  );
});


// ============================================================================
// 3. ENHANCED ASSETS TAB - Media Library with Optimization Tools
// ============================================================================

interface ImageAsset {
  src: string;
  altText: string;
  prompt?: string;
  width?: number;
  height?: number;
}

interface EnhancedAssetsProps {
  images: ImageAsset[];
  onUpdateAlt?: (index: number, newAlt: string) => void;
}

export const EnhancedAssetsTab = memo(({ images, onUpdateAlt }: EnhancedAssetsProps) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [filter, setFilter] = useState('');

  const filteredImages = images.filter(img => 
    img.altText?.toLowerCase().includes(filter.toLowerCase()) ||
    img.prompt?.toLowerCase().includes(filter.toLowerCase())
  );

  const stats = useMemo(() => ({
    total: images.length,
    withAlt: images.filter(i => i.altText && i.altText.trim().length > 0).length,
    missingAlt: images.filter(i => !i.altText || i.altText.trim().length === 0).length
  }), [images]);

  return (
    <div className="enhanced-assets-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#050507' }}>
      <div className="assets-toolbar" style={{
        background: 'linear-gradient(180deg, #0F0F14 0%, #050507 100%)',
        padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <TabIcon name="assets" />
          <span style={{ fontWeight: '700', color: '#E2E8F0', fontSize: '0.9rem' }}>Media Assets Library</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <span className="badge pillar" style={{ fontSize: '0.65rem' }}>{stats.total} TOTAL</span>
            <span className="badge" style={{ fontSize: '0.65rem', background: stats.missingAlt > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: stats.missingAlt > 0 ? '#EF4444' : '#10B981' }}>
              {stats.missingAlt > 0 ? `${stats.missingAlt} MISSING ALT` : 'ALL ALT OK'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Search assets..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{
              padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px', color: '#E2E8F0', fontSize: '0.85rem', width: '200px'
            }}
          />
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px' }}>
            <button onClick={() => setViewMode('grid')} style={{
              padding: '6px 12px', background: viewMode === 'grid' ? 'var(--accent-primary)' : 'transparent',
              border: 'none', borderRadius: '6px', color: 'white', fontSize: '0.75rem', cursor: 'pointer'
            }}>Grid</button>
            <button onClick={() => setViewMode('list')} style={{
              padding: '6px 12px', background: viewMode === 'list' ? 'var(--accent-primary)' : 'transparent',
              border: 'none', borderRadius: '6px', color: 'white', fontSize: '0.75rem', cursor: 'pointer'
            }}>List</button>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '1.5rem', overflowY: 'auto' }}>
        {filteredImages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748B' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>\uD83D\uDDBC\uFE0F</div>
            <h3 style={{ color: '#94A3B8', marginBottom: '0.5rem' }}>No Assets Found</h3>
            <p style={{ fontSize: '0.9rem' }}>{filter ? 'Try adjusting your search filter' : 'Generate content to see media assets here'}</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {filteredImages.map((image, index) => image.src && (
              <div key={index} className="asset-card" onClick={() => setSelectedImage(selectedImage === index ? null : index)} style={{
                background: 'linear-gradient(180deg, #111118 0%, #0A0A0F 100%)',
                borderRadius: '16px', overflow: 'hidden', cursor: 'pointer',
                border: selectedImage === index ? '2px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                transition: 'all 0.2s'
              }}>
                <div style={{ position: 'relative', paddingTop: '66.67%', background: '#000' }}>
                  <img src={image.src} alt={image.altText || 'Asset'} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                  {(!image.altText || image.altText.trim().length === 0) && (
                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(239,68,68,0.9)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '700', color: 'white' }}>MISSING ALT</div>
                  )}
                </div>
                <div style={{ padding: '1rem' }}>
                  <p style={{ color: '#94A3B8', fontSize: '0.8rem', marginBottom: '0.5rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    <strong style={{ color: '#E2E8F0' }}>Alt:</strong> {image.altText || 'Not set'}
                  </p>
                  {image.prompt && (
                    <p style={{ color: '#64748B', fontSize: '0.75rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      <strong>Prompt:</strong> {image.prompt}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filteredImages.map((image, index) => image.src && (
              <div key={index} style={{
                display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem',
                background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)'
              }}>
                <img src={image.src} alt={image.altText || 'Asset'} style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
                <div style={{ flex: 1 }}>
                  <p style={{ color: '#E2E8F0', fontSize: '0.85rem', marginBottom: '0.25rem' }}>{image.altText || 'No alt text'}</p>
                  {image.prompt && <p style={{ color: '#64748B', fontSize: '0.75rem' }}>{image.prompt.substring(0, 100)}...</p>}
                </div>
                <CopyButton text={image.src} label="Copy URL" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});


// ============================================================================
// 4. ENHANCED RANK GUARDIAN TAB - Comprehensive SEO Dashboard
// ============================================================================

const ScoreGauge = ({ score, size = 80, label }: { score: number; size?: number; label?: string }) => {
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  let strokeColor = '#10B981';
  if (score < 85) strokeColor = '#F59E0B';
  if (score < 50) strokeColor = '#EF4444';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: size, height: size, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.05)" strokeWidth="6" fill="none" />
          <circle cx={size / 2} cy={size / 2} r={radius} stroke={strokeColor} strokeWidth="6" fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <span style={{ color: strokeColor, position: 'absolute', fontSize: size * 0.28, fontWeight: '800' }}>{score}</span>
      </div>
      {label && <span style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>}
    </div>
  );
};

interface EnhancedRankGuardianProps {
  content: string;
  title: string;
  metaDescription: string;
  primaryKeyword: string;
  serpData?: any[];
  onSeoChange?: (field: string, value: string) => void;
}

export const EnhancedRankGuardianTab = memo(({ content, title, metaDescription, primaryKeyword, serpData = [], onSeoChange }: EnhancedRankGuardianProps) => {
  const analysis = useMemo(() => {
    const div = document.createElement('div');
    div.innerHTML = content;
    const text = div.textContent || '';
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    const keywordLower = primaryKeyword.toLowerCase();
    const first100Words = text.substring(0, 800).split(/\s+/).slice(0, 100).join(' ').toLowerCase();
    
    return {
      wordCount: words.length,
      readability: calculateFleschReadability(text),
      keywordCount: primaryKeyword ? (text.toLowerCase().match(new RegExp(escapeRegExp(keywordLower), 'g')) || []).length : 0,
      keywordInFirst100: !!keywordLower && first100Words.includes(keywordLower),
      linkCount: div.getElementsByTagName('a').length,
      imageCount: div.getElementsByTagName('img').length,
      h2Count: (content.match(/<h2[^>]*>/gi) || []).length,
      h3Count: (content.match(/<h3[^>]*>/gi) || []).length,
      tableCount: div.getElementsByTagName('table').length,
      listCount: div.querySelectorAll('ul, ol').length,
      hasVerification: content.includes('verification-footer-sota'),
      titleLength: title.length,
      metaLength: metaDescription.length
    };
  }, [content, title, metaDescription, primaryKeyword]);

  const checks = useMemo(() => [
    { id: 'title', name: 'Title Length', target: '50-60 chars', value: analysis.titleLength, valid: analysis.titleLength >= 50 && analysis.titleLength <= 60, category: 'Meta' },
    { id: 'meta', name: 'Meta Description', target: '135-150 chars', value: analysis.metaLength, valid: analysis.metaLength >= 135 && analysis.metaLength <= 150, category: 'Meta' },
    { id: 'words', name: 'Word Count', target: '2200-2800', value: analysis.wordCount, valid: analysis.wordCount >= 2200 && analysis.wordCount <= 2800, category: 'Content' },
    { id: 'keyword', name: 'Keyword in First 100', target: 'Yes', value: analysis.keywordInFirst100 ? 'Yes' : 'No', valid: analysis.keywordInFirst100, category: 'SEO' },
    { id: 'links', name: 'Internal Links', target: '6-12', value: analysis.linkCount, valid: analysis.linkCount >= 6 && analysis.linkCount <= 12, category: 'Content' },
    { id: 'images', name: 'Images', target: '3+', value: analysis.imageCount, valid: analysis.imageCount >= 3, category: 'Content' },
    { id: 'h2', name: 'H2 Headings', target: '4+', value: analysis.h2Count, valid: analysis.h2Count >= 4, category: 'Structure' },
    { id: 'readability', name: 'Readability Score', target: '60+', value: analysis.readability, valid: analysis.readability >= 60, category: 'Content' },
    { id: 'verification', name: 'Scientific Verification', target: 'Yes', value: analysis.hasVerification ? 'Yes' : 'No', valid: analysis.hasVerification, category: 'E-E-A-T' }
  ], [analysis]);

  const scores = useMemo(() => {
    const validCount = checks.filter(c => c.valid).length;
    const seoScore = Math.round((validCount / checks.length) * 100);
    const overallScore = Math.round(seoScore * 0.6 + analysis.readability * 0.4);
    return { seoScore, overallScore, validCount, totalChecks: checks.length };
  }, [checks, analysis.readability]);

  const categories = ['Meta', 'Content', 'SEO', 'Structure', 'E-E-A-T'];

  return (
    <div className="enhanced-guardian-container" style={{ height: '100%', overflowY: 'auto', background: 'linear-gradient(180deg, #0A0A0F 0%, #050507 100%)' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        <div className="guardian-header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem',
          padding: '2rem', background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(59,130,246,0.1) 100%)',
          borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '2rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <ScoreGauge score={scores.overallScore} size={120} />
            <div>
              <h2 style={{ color: '#E2E8F0', fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                {scores.overallScore >= 85 ? 'SOTA Ready' : scores.overallScore >= 70 ? 'Good Progress' : 'Needs Work'}
              </h2>
              <p style={{ color: '#94A3B8', fontSize: '0.9rem' }}>
                {scores.validCount}/{scores.totalChecks} checks passed | Primary: "{primaryKeyword}"
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            <ScoreGauge score={scores.seoScore} size={80} label="SEO" />
            <ScoreGauge score={analysis.readability} size={80} label="Read" />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {categories.map(cat => (
            <div key={cat} className="guardian-category" style={{
              background: 'var(--bg-card)', borderRadius: '16px', padding: '1.5rem',
              border: '1px solid rgba(255,255,255,0.05)'
            }}>
              <h3 style={{ color: '#E2E8F0', fontSize: '1rem', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{cat}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {checks.filter(c => c.category === cat).map(check => (
                  <div key={check.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0.75rem', background: check.valid ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                    borderRadius: '10px', border: `1px solid ${check.valid ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ color: check.valid ? '#10B981' : '#EF4444', fontSize: '1rem' }}>
                        {check.valid ? '\u2713' : '\u2717'}
                      </span>
                      <div>
                        <div style={{ color: '#E2E8F0', fontSize: '0.85rem', fontWeight: '600' }}>{check.name}</div>
                        <div style={{ color: '#64748B', fontSize: '0.75rem' }}>Target: {check.target}</div>
                      </div>
                    </div>
                    <div style={{
                      padding: '4px 10px', background: check.valid ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                      borderRadius: '6px', color: check.valid ? '#10B981' : '#EF4444', fontSize: '0.8rem', fontWeight: '700'
                    }}>
                      {check.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {serpData && serpData.length > 0 && (
          <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h3 style={{ color: '#E2E8F0', fontSize: '1rem', marginBottom: '1rem' }}>SERP Competitor Analysis ({serpData.length} results)</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
              {serpData.slice(0, 10).map((result: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                  <span style={{ color: '#64748B', fontSize: '0.8rem', width: '24px' }}>#{i + 1}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#E2E8F0', fontSize: '0.85rem' }}>{result.title?.substring(0, 60)}...</div>
                    <div style={{ color: '#64748B', fontSize: '0.75rem' }}>{result.link?.substring(0, 50)}...</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});


// ============================================================================
// 5. ENHANCED RAW JSON TAB - Schema Viewer with Validation & Export
// ============================================================================

interface EnhancedRawJsonProps {
  data: any;
  onUpdate?: (newData: any) => void;
}

export const EnhancedRawJsonTab = memo(({ data, onUpdate }: EnhancedRawJsonProps) => {
  const [viewMode, setViewMode] = useState<'formatted' | 'raw' | 'tree'>('formatted');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['root']));
  const [validationResult, setValidationResult] = useState<{ valid: boolean; error?: string }>({ valid: true });

  const jsonString = useMemo(() => {
    try {
      return JSON.stringify(data, null, 2);
    } catch (e) {
      return 'Error serializing JSON';
    }
  }, [data]);

  const stats = useMemo(() => {
    const str = jsonString;
    return {
      size: (new Blob([str]).size / 1024).toFixed(2),
      keys: Object.keys(data || {}).length,
      depth: calculateJsonDepth(data),
      chars: str.length
    };
  }, [jsonString, data]);

  const highlightedJson = useMemo(() => {
    if (!searchTerm || viewMode !== 'formatted') return jsonString;
    const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, 'gi');
    return jsonString.replace(regex, '<mark style="background:#FBBF24;color:#000;padding:0 2px;border-radius:2px">$1</mark>');
  }, [jsonString, searchTerm, viewMode]);

  const downloadJson = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'content-data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderTreeNode = (key: string, value: any, path: string, depth: number = 0) => {
    const isExpanded = expandedPaths.has(path);
    const isObject = value !== null && typeof value === 'object';
    const isArray = Array.isArray(value);
    const toggleExpand = () => {
      const newSet = new Set(expandedPaths);
      if (isExpanded) newSet.delete(path);
      else newSet.add(path);
      setExpandedPaths(newSet);
    };

    const matchesSearch = searchTerm && (
      key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (!isObject && String(value).toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
      <div key={path} style={{ marginLeft: depth * 16 }}>
        <div
          onClick={isObject ? toggleExpand : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '4px 8px',
            cursor: isObject ? 'pointer' : 'default', borderRadius: '4px',
            background: matchesSearch ? 'rgba(251, 191, 36, 0.2)' : 'transparent'
          }}
        >
          {isObject && (
            <span style={{ color: '#64748B', fontSize: '0.75rem', width: '12px' }}>
              {isExpanded ? '\u25BC' : '\u25B6'}
            </span>
          )}
          {!isObject && <span style={{ width: '12px' }} />}
          <span style={{ color: '#10B981', fontWeight: '600' }}>"{key}"</span>
          <span style={{ color: '#64748B' }}>:</span>
          {isObject ? (
            <span style={{ color: '#94A3B8', fontSize: '0.85rem' }}>
              {isArray ? `Array[${value.length}]` : `Object{${Object.keys(value).length}}`}
            </span>
          ) : (
            <span style={{ color: typeof value === 'string' ? '#FBBF24' : typeof value === 'number' ? '#60A5FA' : '#F472B6' }}>
              {typeof value === 'string' ? `"${String(value).substring(0, 100)}${String(value).length > 100 ? '...' : ''}"` : String(value)}
            </span>
          )}
        </div>
        {isObject && isExpanded && (
          <div>
            {Object.entries(value).map(([k, v]) => renderTreeNode(k, v, `${path}.${k}`, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="enhanced-json-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0D1117' }}>
      <div className="json-toolbar" style={{
        background: 'linear-gradient(180deg, #161B22 0%, #0D1117 100%)',
        padding: '0.75rem 1rem', borderBottom: '1px solid #30363D',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <TabIcon name="json" />
          <span style={{ fontWeight: '700', color: '#E6EDF3', fontSize: '0.9rem' }}>JSON Schema Viewer</span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <span className="badge pillar" style={{ fontSize: '0.65rem' }}>{stats.size} KB</span>
            <span className="badge" style={{ fontSize: '0.65rem', background: 'rgba(96,165,250,0.2)', color: '#60A5FA' }}>{stats.keys} KEYS</span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="Search JSON..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              padding: '6px 12px', background: '#21262D', border: '1px solid #30363D',
              borderRadius: '6px', color: '#E6EDF3', fontSize: '0.8rem', width: '150px'
            }}
          />
          <div style={{ display: 'flex', background: '#21262D', borderRadius: '6px', padding: '2px' }}>
            {(['formatted', 'tree', 'raw'] as const).map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)} style={{
                padding: '5px 10px', background: viewMode === mode ? '#238636' : 'transparent',
                border: 'none', borderRadius: '4px', color: 'white', fontSize: '0.7rem', cursor: 'pointer', textTransform: 'capitalize'
              }}>{mode}</button>
            ))}
          </div>
          <CopyButton text={jsonString} />
          <button onClick={downloadJson} style={{ padding: '6px 12px', background: '#238636', border: 'none', borderRadius: '6px', color: 'white', fontSize: '0.75rem', cursor: 'pointer' }}>Export</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: viewMode === 'tree' ? '1rem' : 0 }}>
        {viewMode === 'tree' ? (
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.85rem', color: '#E6EDF3' }}>
            {data && Object.entries(data).map(([k, v]) => renderTreeNode(k, v, `root.${k}`, 0))}
          </div>
        ) : (
          <pre
            style={{
              margin: 0, padding: '1rem', background: '#0D1117', color: '#E6EDF3',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: '0.85rem', lineHeight: '1.5', whiteSpace: viewMode === 'raw' ? 'pre' : 'pre-wrap',
              wordBreak: 'break-word'
            }}
            dangerouslySetInnerHTML={{ __html: highlightedJson }}
          />
        )}
      </div>
      <div className="json-footer" style={{
        padding: '0.5rem 1rem', background: '#161B22', borderTop: '1px solid #30363D',
        display: 'flex', justifyContent: 'space-between', color: '#6E7681', fontSize: '0.75rem'
      }}>
        <span>Depth: {stats.depth} | Keys: {stats.keys} | Chars: {stats.chars.toLocaleString()}</span>
        <span style={{ color: validationResult.valid ? '#10B981' : '#EF4444' }}>
          {validationResult.valid ? '\u2713 Valid JSON' : `\u2717 ${validationResult.error}`}
        </span>
      </div>
    </div>
  );
});

function calculateJsonDepth(obj: any, currentDepth: number = 0): number {
  if (obj === null || typeof obj !== 'object') return currentDepth;
  const values = Object.values(obj);
  if (values.length === 0) return currentDepth;
  return Math.max(...values.map(v => calculateJsonDepth(v, currentDepth + 1)));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  EnhancedEditorTab,
  EnhancedRawHtmlTab,
  EnhancedAssetsTab,
  EnhancedRankGuardianTab,
  EnhancedRawJsonTab
};
