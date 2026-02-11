// SOTA CONTENT VIEWER PANEL - Enterprise-Grade Content Display
// v2.0.0 - Fixed: cursor-aware insertion, publish uses edited content, auto-save

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'; // 🔧 FIX: Added useRef
import { 
  X, Copy, Check, Download, ExternalLink, Sparkles, 
  FileText, Code, Search, BarChart3, Link2, Shield,
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  BookOpen, Clock, Target, Zap, Award, Eye, EyeOff,
  TrendingUp, CheckCircle, AlertTriangle, Brain, Globe,
  Hash, List, Type, ArrowRight, Upload, Loader2,
  Edit3, Save, RotateCcw, Bold, Italic, Heading1, Heading2, Heading3, 
  ListOrdered, Quote, Table, Image as ImageIcon, Undo, Redo
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContentItem } from '@/lib/store';
import type { GeneratedContent, NeuronWriterAnalysis } from '@/lib/sota';
import { useWordPressPublish } from '@/hooks/useWordPressPublish';
import { getPathnameFromUrl, getWordPressPostSlugFromUrl, toSafeWpSlug } from '@/lib/wordpress/slug';
import { toast } from 'sonner';

function sanitizeHtml(html: string): string {
  let sanitized = html;
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<iframe\b[^>]*>/gi, (match) => {
    if (/src\s*=\s*["'][^"']*(?:youtube\.com\/embed|youtube-nocookie\.com\/embed|player\.vimeo\.com)/i.test(match)) {
      return match;
    }
    return '';
  });
  sanitized = sanitized.replace(/<object\b[^>]*>[\s\S]*?<\/object>/gi, '');
  sanitized = sanitized.replace(/<embed\b[^>]*>/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');
  sanitized = sanitized.replace(/href\s*=\s*["']?\s*javascript\s*:/gi, 'href="');
  sanitized = sanitized.replace(/src\s*=\s*["']?\s*javascript\s*:/gi, 'src="');
  return sanitized;
}

// 🔧 FIX: Helper function that was missing / truncated
function formatHtml(html: string): string {
  return html
    .replace(/></g, '>\n<')
    .replace(/(<\/(?:div|p|h[1-6]|ul|ol|li|table|tr|thead|tbody|blockquote|figure|section|article)>)/gi, '$1\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface ContentViewerPanelProps {
  item: ContentItem | null;
  generatedContent?: GeneratedContent | null;
  neuronData?: NeuronWriterAnalysis | null;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onSaveContent?: (itemId: string, newContent: string) => void;
}

type ViewTab = 'preview' | 'editor' | 'html' | 'seo' | 'schema' | 'links' | 'neuron';

export function ContentViewerPanel({ 
  item, 
  generatedContent,
  neuronData,
  onClose, 
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  onSaveContent
}: ContentViewerPanelProps) {
  const [activeTab, setActiveTab] = useState<ViewTab>('preview');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [showRawHtml, setShowRawHtml] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishStatus, setPublishStatus] = useState<'draft' | 'publish'>('draft');
  
  // 🔧 FIX: Added ref for cursor-aware insertion in editor textarea
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { publish, isPublishing, publishResult, clearResult, isConfigured } = useWordPressPublish();

  if (!item) return null;

  const content = item.content || '';
  const hasContent = content.length > 0;
  const wordCount = item.wordCount || content.split(/\s+/).filter(Boolean).length;

  const sourcePathname = useMemo(() => getPathnameFromUrl(item.url), [item.url]);
  const sourceSlug = useMemo(() => getWordPressPostSlugFromUrl(item.url), [item.url]);

  const effectivePublishSlug = useMemo(() => {
    if (sourceSlug) return sourceSlug;
    if (generatedContent?.slug) return toSafeWpSlug(generatedContent.slug);
    const title = item.title.replace(/^\s*rewrite\s*:\s*/i, '').trim();
    return toSafeWpSlug(title);
  }, [generatedContent?.slug, item.title, sourceSlug]);

  const headings = useMemo(() => {
    const h2Matches = content.match(/<h2[^>]*>(.*?)<\/h2>/gi) || [];
    const h3Matches = content.match(/<h3[^>]*>(.*?)<\/h3>/gi) || [];
    return {
      h2: h2Matches.map(h => h.replace(/<[^>]*>/g, '')),
      h3: h3Matches.map(h => h.replace(/<[^>]*>/g, ''))
    };
  }, [content]);

  const contentLinks = useMemo(() => {
    const linkMatches = content.match(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi) || [];
    return linkMatches.map(link => {
      const hrefMatch = link.match(/href="([^"]*)"/);
      const textMatch = link.match(/>(.*?)<\/a>/);
      return {
        url: hrefMatch?.[1] || '',
        text: textMatch?.[1]?.replace(/<[^>]*>/g, '') || ''
      };
    });
  }, [content]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title.toLowerCase().replace(/\s+/g, '-')}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- Editor state ---
  const [editedContent, setEditedContent] = useState<string>('');
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const [editorHistory, setEditorHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Initialize editor content when item changes
  useEffect(() => {
    if (!item?.id) return;
    // 🔧 FIX: Restore from auto-save if available
    const autoSaveKey = `sota-editor-autosave-${item.id}`;
    const autoSaved = localStorage.getItem(autoSaveKey);
    const initialContent = autoSaved && autoSaved !== content ? autoSaved : content;

    setEditedContent(initialContent);
    setEditorHistory([initialContent]);
    setHistoryIndex(0);
    setIsEditorDirty(initialContent !== content);

    if (autoSaved && autoSaved !== content) {
      toast.info('Restored unsaved changes from auto-save');
    }
  }, [content, item?.id]);

  // 🔧 FIX: Auto-save to localStorage (debounced 1.5s)
  useEffect(() => {
    if (!item?.id || !isEditorDirty) return;
    const key = `sota-editor-autosave-${item.id}`;
    const timeout = setTimeout(() => {
      localStorage.setItem(key, editedContent);
    }, 1500);
    return () => clearTimeout(timeout);
  }, [editedContent, isEditorDirty, item?.id]);

  const handleEditorChange = useCallback((newContent: string) => {
    setEditedContent(newContent);
    setIsEditorDirty(newContent !== content);
    setEditorHistory(prev => {
      const newHistory = [...prev.slice(0, historyIndex + 1), newContent].slice(-50);
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  }, [content, historyIndex]);

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setEditedContent(editorHistory[newIndex]);
      setIsEditorDirty(editorHistory[newIndex] !== content);
    }
  }, [historyIndex, editorHistory, content]);

  const handleRedo = useCallback(() => {
    if (historyIndex < editorHistory.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setEditedContent(editorHistory[newIndex]);
      setIsEditorDirty(editorHistory[newIndex] !== content);
    }
  }, [historyIndex, editorHistory, content]);

  const handleResetEditor = useCallback(() => {
    setEditedContent(content);
    setIsEditorDirty(false);
    setEditorHistory([content]);
    setHistoryIndex(0);
    // Clear auto-save
    if (item?.id) localStorage.removeItem(`sota-editor-autosave-${item.id}`);
    toast.info('Editor reset to original content');
  }, [content, item?.id]);

  const handleSaveContent = useCallback(() => {
    if (!item || !onSaveContent || !isEditorDirty) return;
    onSaveContent(item.id, editedContent);
    setIsEditorDirty(false);
    // Clear auto-save after successful save
    if (item.id) localStorage.removeItem(`sota-editor-autosave-${item.id}`);
    toast.success('Content saved successfully!');
  }, [item, onSaveContent, isEditorDirty, editedContent]);

  // 🔧 FIX: insertHtmlTag now uses textarea selectionStart/selectionEnd for cursor-aware insertion
  const insertHtmlTag = useCallback((tag: string, attributes: string = '') => {
    const textarea = textareaRef.current;
    const start = textarea ? textarea.selectionStart : editedContent.length;
    const end = textarea ? textarea.selectionEnd : editedContent.length;
    const selectedText = start !== end ? editedContent.substring(start, end) : 'Your text here';
    
    let insertion = '';
    if (['h2', 'h3', 'p', 'strong', 'em', 'blockquote'].includes(tag)) {
      insertion = `<${tag}${attributes}>${selectedText}</${tag}>`;
    } else if (tag === 'ul' || tag === 'ol') {
      insertion = `<${tag}>\n  <li>${selectedText}</li>\n</${tag}>`;
    } else if (tag === 'table') {
      insertion = `<table style="width: 100%; border-collapse: collapse;">\n  <thead>\n    <tr>\n      <th style="padding: 12px; border: 1px solid #374151; background: #1f2937;">Header 1</th>\n      <th style="padding: 12px; border: 1px solid #374151; background: #1f2937;">Header 2</th>\n    </tr>\n  </thead>\n  <tbody>\n    <tr>\n      <td style="padding: 12px; border: 1px solid #374151;">Data 1</td>\n      <td style="padding: 12px; border: 1px solid #374151;">Data 2</td>\n    </tr>\n  </tbody>\n</table>`;
    } else if (tag === 'img') {
      insertion = `<img src="https://placehold.co/800x400" alt="${selectedText}" style="max-width: 100%; border-radius: 12px;" />`;
    }

    // 🔧 FIX: Splice at cursor position instead of appending to end
    const newContent = editedContent.substring(0, start) + insertion + editedContent.substring(end);
    handleEditorChange(newContent);

    // Restore cursor position after React re-render
    requestAnimationFrame(() => {
      if (textarea) {
        const newPos = start + insertion.length;
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
        textarea.focus();
      }
    });
  }, [editedContent, handleEditorChange]);

  // 🔧 FIX: Publish uses editedContent when editor is dirty
  const handlePublishToWordPress = async () => {
    if (!item) return;

    const publishContent = isEditorDirty ? editedContent : content; // 🔧 FIX: use edited content if dirty
    if (!publishContent) return;

    const cleanTitle = item.title.replace(/^\s*rewrite\s*:\s*/i, '').trim();
    const effectiveSeoTitle = generatedContent?.seoTitle || cleanTitle;
    const wpTitle = generatedContent?.seoTitle || generatedContent?.title || cleanTitle;
    
    const result = await publish(
      wpTitle,
      publishContent, // 🔧 FIX: was `content`, now uses publishContent
      {
        status: publishStatus,
        slug: effectivePublishSlug,
        metaDescription: generatedContent?.metaDescription,
        excerpt: generatedContent?.metaDescription,
        seoTitle: effectiveSeoTitle,
        sourceUrl: item.url,
      }
    );

    if (result.success) {
      toast.success(`Published to WordPress as ${publishStatus}!`, {
        description: result.postUrl ? `Post ID: ${result.postId}` : undefined,
        action: result.postUrl ? {
          label: 'View Post',
          onClick: () => window.open(result.postUrl, '_blank'),
        } : undefined,
      });
      setShowPublishModal(false);
      // Clear auto-save on successful publish
      if (item.id) localStorage.removeItem(`sota-editor-autosave-${item.id}`);
    } else {
      toast.error('Failed to publish', { description: result.error });
    }
  };

  const tabs: { id: ViewTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'preview', label: 'Preview', icon: <Eye className="w-4 h-4" /> },
    { id: 'editor', label: 'Editor', icon: <Edit3 className="w-4 h-4" />, badge: isEditorDirty ? 1 : undefined },
    { id: 'html', label: 'HTML', icon: <Code className="w-4 h-4" /> },
    { id: 'seo', label: 'SEO Analysis', icon: <Search className="w-4 h-4" /> },
    { id: 'links', label: 'Internal Links', icon: <Link2 className="w-4 h-4" />, badge: generatedContent?.internalLinks?.length || contentLinks.length },
    { id: 'schema', label: 'Schema', icon: <Shield className="w-4 h-4" /> },
    { id: 'neuron', label: 'NeuronWriter', icon: <Brain className="w-4 h-4" />, badge: neuronData?.terms?.length }
  ];

  return (
    <div className={cn(
      "fixed bg-background/98 backdrop-blur-xl z-50 flex flex-col",
      isFullscreen ? "inset-0" : "inset-4 rounded-2xl border border-border"
    )}>
      {/* ===== HEADER ===== */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-card/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button onClick={onPrevious} disabled={!hasPrevious} className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={onNext} disabled={!hasNext} className="p-2 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-all">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn(
                "px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider",
                item.type === 'pillar' && "bg-purple-500/20 text-purple-400 border border-purple-500/30",
                item.type === 'cluster' && "bg-blue-500/20 text-blue-400 border border-blue-500/30",
                item.type === 'single' && "bg-primary/20 text-primary border border-primary/30",
                item.type === 'refresh' && "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
              )}>{item.type}</span>
              <h2 className="text-lg font-bold text-foreground truncate max-w-[500px]">{item.title}</h2>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{wordCount.toLocaleString()} words</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />~{Math.ceil(wordCount / 200)} min read</span>
              <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" />{item.primaryKeyword}</span>
              {generatedContent && (
                <span className="flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-primary" />
                  <span className="text-primary font-medium">{generatedContent.qualityScore.overall}% Quality</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy} disabled={!hasContent} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30">
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            <span className="hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
          </button>
          <button onClick={handleDownload} disabled={!hasContent} className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all disabled:opacity-30">
            <Download className="w-4 h-4" /><span className="hidden sm:inline">Download</span>
          </button>
          <button onClick={() => setShowPublishModal(true)} disabled={!hasContent} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-all disabled:opacity-30">
            <Upload className="w-4 h-4" />Publish to WP
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-all">
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted/50 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="flex border-b border-border bg-card/30 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap",
            activeTab === tab.id ? "text-primary border-primary bg-primary/5" : "text-muted-foreground border-transparent hover:text-foreground hover:border-muted-foreground/30"
          )}>
            {tab.icon}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="ml-1 px-1.5 py-0.5 bg-primary/20 text-primary text-xs rounded-full font-bold">{tab.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* ===== CONTENT AREA ===== */}
      <div className="flex-1 overflow-auto">
        {!hasContent ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-20 h-20 rounded-full bg-muted/30 flex items-center justify-center mb-6">
              <FileText className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Content Not Yet Generated</h3>
            <p className="text-muted-foreground max-w-md mb-6">Select this item and click "Generate Selected" to create the content.</p>
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-400 text-sm">
              <Clock className="w-4 h-4" />Status: {item.status}
            </div>
          </div>
        ) : (
          <>
            {/* ---------- PREVIEW TAB ---------- */}
            {activeTab === 'preview' && (
              <div className="p-6">
                <div className="flex items-center gap-2 mb-4 px-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">WordPress Preview</span>
                </div>
                <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden max-w-4xl mx-auto">
                  <div className="bg-gray-100 px-4 py-2.5 border-b border-gray-200 flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-yellow-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="flex-1 bg-white rounded-lg px-3 py-1 text-xs text-gray-500 font-mono truncate border border-gray-200">
                      {item.url || `yoursite.com/${effectivePublishSlug}`}
                    </div>
                  </div>
                  <style dangerouslySetInnerHTML={{ __html: `
                    .wp-preview-content h1 { font-size: 32px; font-weight: 800; color: #0f172a; margin: 32px 0 16px; line-height: 1.3; }
                    .wp-preview-content h2 { font-size: 26px; font-weight: 700; color: #0f172a; margin: 40px 0 16px; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px; }
                    .wp-preview-content h3 { font-size: 21px; font-weight: 700; color: #1e293b; margin: 32px 0 12px; }
                    .wp-preview-content p { margin: 0 0 20px; color: #374151; line-height: 1.85; font-size: 17px; }
                    .wp-preview-content a { color: #2563eb; text-decoration: none; }
                    .wp-preview-content a:hover { text-decoration: underline; }
                    .wp-preview-content strong { color: #0f172a; font-weight: 700; }
                    .wp-preview-content ul, .wp-preview-content ol { margin: 16px 0 24px; padding-left: 28px; color: #374151; }
                    .wp-preview-content li { margin-bottom: 10px; line-height: 1.8; }
                    .wp-preview-content blockquote { border-left: 4px solid #10b981; margin: 24px 0; padding: 16px 24px; background: #f8fafc; border-radius: 0 12px 12px 0; }
                    .wp-preview-content img { max-width: 100%; height: auto; border-radius: 12px; margin: 24px 0; }
                    .wp-preview-content table { width: 100%; border-collapse: collapse; margin: 24px 0; }
                    .wp-preview-content th { background: #f8fafc; padding: 14px 18px; text-align: left; font-weight: 700; border: 1px solid #e2e8f0; }
                    .wp-preview-content td { padding: 14px 18px; border: 1px solid #e2e8f0; color: #374151; }
                    .wp-preview-content hr { border: none; border-top: 2px solid #f1f5f9; margin: 40px 0; }
                  `}} />
                  <article className="wp-preview-content" style={{ padding: '48px 56px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1a1a1a', lineHeight: 1.8, fontSize: '17px', backgroundColor: '#ffffff' }}
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(isEditorDirty ? editedContent : content) }}
                  />
                </div>
              </div>
            )}

            {/* ---------- EDITOR TAB ---------- */}
            {activeTab === 'editor' && (
              <div className="p-6 h-full flex flex-col">
                <div className="bg-card/50 border border-border rounded-xl p-3 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Edit3 className="w-5 h-5 text-primary" />Content Editor
                      {isEditorDirty && <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full font-medium">Unsaved Changes</span>}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button onClick={handleUndo} disabled={historyIndex <= 0} className="p-2 bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all disabled:opacity-30" title="Undo"><Undo className="w-4 h-4" /></button>
                      <button onClick={handleRedo} disabled={historyIndex >= editorHistory.length - 1} className="p-2 bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all disabled:opacity-30" title="Redo"><Redo className="w-4 h-4" /></button>
                      <div className="w-px h-6 bg-border mx-1" />
                      <button onClick={handleResetEditor} disabled={!isEditorDirty} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg text-sm transition-all disabled:opacity-30"><RotateCcw className="w-4 h-4" />Reset</button>
                      <button onClick={() => { navigator.clipboard.writeText(editedContent); toast.success('Copied!'); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary hover:bg-primary/30 rounded-lg text-sm transition-all"><Copy className="w-4 h-4" />Copy</button>
                      {onSaveContent && (
                        <button onClick={handleSaveContent} disabled={!isEditorDirty} className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg text-sm font-semibold transition-all disabled:opacity-30 shadow-sm"><Save className="w-4 h-4" />Save Changes</button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-1">
                      <button onClick={() => insertHtmlTag('h2')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="H2"><Heading2 className="w-4 h-4" /></button>
                      <button onClick={() => insertHtmlTag('h3')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="H3"><Heading3 className="w-4 h-4" /></button>
                    </div>
                    <div className="w-px h-6 bg-border mx-1" />
                    <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-1">
                      <button onClick={() => insertHtmlTag('strong')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="Bold"><Bold className="w-4 h-4" /></button>
                      <button onClick={() => insertHtmlTag('em')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="Italic"><Italic className="w-4 h-4" /></button>
                    </div>
                    <div className="w-px h-6 bg-border mx-1" />
                    <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-1">
                      <button onClick={() => insertHtmlTag('ul')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="Bullet List"><List className="w-4 h-4" /></button>
                      <button onClick={() => insertHtmlTag('ol')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="Numbered List"><ListOrdered className="w-4 h-4" /></button>
                    </div>
                    <div className="w-px h-6 bg-border mx-1" />
                    <div className="flex items-center gap-0.5 bg-muted/30 rounded-lg p-1">
                      <button onClick={() => insertHtmlTag('blockquote')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="Quote"><Quote className="w-4 h-4" /></button>
                      <button onClick={() => insertHtmlTag('table')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="Table"><Table className="w-4 h-4" /></button>
                      <button onClick={() => insertHtmlTag('img')} className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-all" title="Image"><ImageIcon className="w-4 h-4" /></button>
                    </div>
                    <div className="ml-auto text-xs text-muted-foreground">{editedContent.split(/\s+/).filter(Boolean).length.toLocaleString()} words</div>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
                  <div className="flex flex-col bg-muted/20 border border-border rounded-xl overflow-hidden">
                    <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center gap-2">
                      <Code className="w-4 h-4 text-muted-foreground" /><span className="text-sm font-medium text-foreground">HTML Source</span>
                    </div>
                    {/* 🔧 FIX: Added ref={textareaRef} for cursor-aware insertion */}
                    <textarea
                      ref={textareaRef}
                      value={editedContent}
                      onChange={(e) => handleEditorChange(e.target.value)}
                      className="flex-1 p-4 bg-transparent text-foreground font-mono text-sm resize-none focus:outline-none placeholder:text-muted-foreground leading-relaxed"
                      placeholder="Paste or type your HTML content here..."
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex flex-col bg-muted/20 border border-border rounded-xl overflow-hidden">
                    <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center gap-2">
                      <Eye className="w-4 h-4 text-primary" /><span className="text-sm font-medium text-foreground">Live Preview</span>
                    </div>
                    <div className="flex-1 overflow-auto p-4">
                      <article className="prose prose-invert prose-sm max-w-none prose-headings:text-foreground prose-h2:text-xl prose-h2:text-primary prose-p:text-muted-foreground prose-p:leading-relaxed prose-a:text-primary prose-strong:text-foreground prose-blockquote:border-l-primary prose-blockquote:bg-muted/30"
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(editedContent) }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- HTML TAB ---------- */}
            {activeTab === 'html' && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-foreground">HTML Source</h3>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowRawHtml(!showRawHtml)} className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-lg text-sm text-muted-foreground hover:text-foreground transition-all">
                      {showRawHtml ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      {showRawHtml ? 'Formatted' : 'Raw'}
                    </button>
                    <button onClick={handleCopy} className="flex items-center gap-2 px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-sm hover:bg-primary/30 transition-all">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied!' : 'Copy All'}
                    </button>
                  </div>
                </div>
                <div className="bg-muted/20 border border-border rounded-xl overflow-hidden">
                  <div className="bg-muted/30 px-4 py-2 border-b border-border flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500/50" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
                    <div className="w-3 h-3 rounded-full bg-green-500/50" />
                    <span className="ml-2 text-xs text-muted-foreground font-mono">content.html</span>
                  </div>
                  <pre className="p-4 overflow-auto text-sm text-foreground font-mono max-h-[60vh] leading-relaxed whitespace-pre-wrap">
                    {showRawHtml ? content : formatHtml(content)}
                  </pre>
                </div>
              </div>
            )}

            {/* ---------- SEO ANALYSIS TAB ---------- */}
            {activeTab === 'seo' && (
              <div className="p-6 space-y-6">
                {generatedContent && (
                  <div className="bg-card/50 border border-border rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-primary" />Quality Score Breakdown
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      <QualityMetric label="Overall" value={generatedContent.qualityScore.overall} />
                      <QualityMetric label="Readability" value={generatedContent.qualityScore.readability} />
                      <QualityMetric label="SEO" value={generatedContent.qualityScore.seo} />
                      <QualityMetric label="E-E-A-T" value={generatedContent.qualityScore.eeat} />
                      <QualityMetric label="Uniqueness" value={generatedContent.qualityScore.uniqueness} />
                      <QualityMetric label="Fact Accuracy" value={generatedContent.qualityScore.factAccuracy} />
                    </div>
                  </div>
                )}
                <div className="bg-card/50 border border-border rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Target className="w-5 h-5 text-primary" />Keywords
                  </h3>
                  <div className="space-y-3">
                    <div><span className="text-muted-foreground text-sm">Primary:</span> <span className="ml-2 px-3 py-1 bg-primary/20 text-primary rounded-lg text-sm">{item.primaryKeyword}</span></div>
                    {generatedContent?.secondaryKeywords && generatedContent.secondaryKeywords.length > 0 && (
                      <div>
                        <span className="text-muted-foreground text-sm">Secondary:</span>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {generatedContent.secondaryKeywords.map((kw, i) => (
                            <span key={i} className="px-2 py-1 bg-muted text-muted-foreground rounded text-xs">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <div className="bg-card/50 border border-border rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Hash className="w-5 h-5 text-primary" />Content Structure
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="space-y-2">
                      <p className="text-muted-foreground">H2 Headings: <span className="text-foreground font-medium">{headings.h2.length}</span></p>
                      <p className="text-muted-foreground">H3 Headings: <span className="text-foreground font-medium">{headings.h3.length}</span></p>
                      <p className="text-muted-foreground">Word Count: <span className="text-foreground font-medium">{wordCount.toLocaleString()}</span></p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-muted-foreground">Internal Links: <span className="text-foreground font-medium">{contentLinks.length}</span></p>
                      <p className="text-muted-foreground">Slug: <span className="text-primary font-mono text-xs">/{effectivePublishSlug}</span></p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ---------- INTERNAL LINKS TAB ---------- */}
            {activeTab === 'links' && (
              <div className="p-6 space-y-6">
                <div className="bg-card/50 border border-border rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Link2 className="w-5 h-5 text-primary" />
                    Internal Links ({generatedContent?.internalLinks?.length || contentLinks.length})
                  </h3>
                  {(generatedContent?.internalLinks && generatedContent.internalLinks.length > 0) ? (
                    <div className="space-y-3">
                      {generatedContent.internalLinks.map((link: any, i: number) => (
                        <div key={i} className="flex items-start gap-4 p-3 bg-muted/20 border border-border rounded-lg">
                          <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary text-xs font-bold">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-primary">{link.anchor}</p>
                            <p className="text-xs text-muted-foreground truncate mt-1">{link.targetUrl}</p>
                            {link.relevanceScore !== undefined && (
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs text-muted-foreground">Relevance:</span>
                                <div className="h-1.5 flex-1 max-w-[100px] bg-muted rounded-full overflow-hidden">
                                  <div className={cn("h-full rounded-full", link.relevanceScore >= 70 ? "bg-green-500" : link.relevanceScore >= 40 ? "bg-yellow-500" : "bg-red-500")} style={{ width: `${link.relevanceScore}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{link.relevanceScore}%</span>
                              </div>
                            )}
                          </div>
                          <a href={link.targetUrl} target="_blank" rel="noopener noreferrer" className="p-2 text-muted-foreground hover:text-primary transition-colors">
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      ))}
                    </div>
                  ) : contentLinks.length > 0 ? (
                    <div className="space-y-2">
                      {contentLinks.map((link, i) => (
                        <div key={i} className="flex items-center justify-between p-2 bg-muted/20 rounded-lg text-sm">
                          <span className="text-primary">{link.text}</span>
                          <span className="text-muted-foreground truncate max-w-[300px] ml-4">{link.url}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm text-center py-8">No internal links found in this content.</p>
                  )}
                </div>
              </div>
            )}

            {/* ---------- SCHEMA TAB ---------- */}
            {activeTab === 'schema' && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />Schema.org Structured Data
                  </h3>
                  <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(generatedContent?.schema || {}, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-sm hover:bg-primary/30 transition-all">
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}Copy Schema
                  </button>
                </div>
                {generatedContent?.schema ? (
                  <pre className="bg-muted/20 border border-border p-4 rounded-xl overflow-auto text-sm text-foreground font-mono whitespace-pre-wrap max-h-[60vh]">
                    {JSON.stringify(generatedContent.schema, null, 2)}
                  </pre>
                ) : (
                  <p className="text-muted-foreground text-sm text-center py-12">No schema data available for this content.</p>
                )}
              </div>
            )}

            {/* ---------- NEURONWRITER TAB ---------- */}
            {activeTab === 'neuron' && (
              <div className="p-6 space-y-6">
                <div className="bg-card/50 border border-border rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                    <Brain className="w-5 h-5 text-primary" />NeuronWriter Analysis
                  </h3>
                  {neuronData?.terms && neuronData.terms.length > 0 ? (
                    <div className="space-y-2">
                      {neuronData.terms.slice(0, 30).map((term: any, i: number) => {
                        const isUsed = content.toLowerCase().includes((term.term || term.name || '').toLowerCase());
                        return (
                          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                            <span className={cn("text-sm", isUsed ? "text-green-400" : "text-muted-foreground")}>{term.term || term.name || term}</span>
                            <span className={cn("text-xs px-2 py-0.5 rounded-full", isUsed ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground")}>
                              {isUsed ? '✓ Used' : 'Missing'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm text-center py-8">No NeuronWriter data available. Enable NeuronWriter integration in Setup.</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ===== PUBLISH MODAL ===== */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4" onClick={() => setShowPublishModal(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><Upload className="w-5 h-5 text-primary" />Publish to WordPress</h3>
              <button onClick={() => setShowPublishModal(false)} className="p-1 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            {!isConfigured && (
              <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                WordPress is not configured. Go to Setup tab to add your credentials.
              </div>
            )}
            {isEditorDirty && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-sm flex items-start gap-2">
                <Edit3 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                You have unsaved editor changes. The <strong>edited version</strong> will be published.
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">Post Status</label>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => setPublishStatus('draft')} className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-all", publishStatus === 'draft' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground")}>Draft</button>
                  <button onClick={() => setPublishStatus('publish')} className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-all", publishStatus === 'publish' ? "bg-green-600 text-white" : "bg-muted text-muted-foreground hover:text-foreground")}>Publish</button>
                </div>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">URL Slug</label>
                <p className="text-sm text-primary font-mono mt-1">/{effectivePublishSlug}</p>
              </div>
              {generatedContent?.seoTitle && (
                <div>
                  <label className="text-sm text-muted-foreground">SEO Title</label>
                  <p className="text-sm text-foreground mt-1">{generatedContent.seoTitle}</p>
                </div>
              )}
              {generatedContent?.metaDescription && (
                <div>
                  <label className="text-sm text-muted-foreground">Meta Description</label>
                  <p className="text-sm text-foreground mt-1 line-clamp-2">{generatedContent.metaDescription}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowPublishModal(false)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/80 transition-all">Cancel</button>
              <button onClick={handlePublishToWordPress} disabled={isPublishing || !isConfigured} className="px-6 py-2 bg-primary text-primary-foreground font-semibold rounded-lg text-sm hover:bg-primary/90 transition-all disabled:opacity-50 flex items-center gap-2">
                {isPublishing ? <><Loader2 className="w-4 h-4 animate-spin" />Publishing...</> : <><Upload className="w-4 h-4" />Publish {publishStatus === 'publish' ? 'Now' : 'as Draft'}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ===== HELPER COMPONENTS =====

function QualityMetric({ label, value }: { label: string; value: number }) {
  const color = value >= 80 ? 'bg-green-500' : value >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{value}%</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default ContentViewerPanel;
