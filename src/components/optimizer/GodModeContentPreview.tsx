/**
 * God Mode 2.0 - Content Preview Modal v2.0
 * 
 * View, copy, and manually publish generated content from history.
 * Essential for reviewing content that didn't meet quality threshold.
 * 
 * v2.0: Uses createPortal to render at document.body level, preventing
 * click events from bubbling up and causing navigation/redirection.
 */

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, ExternalLink, FileText, CheckCircle2, AlertTriangle, Send, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useOptimizerStore } from '@/lib/store';
import type { GodModeHistoryItem } from '@/lib/sota/GodModeTypes';

interface GodModeContentPreviewProps {
  item: GodModeHistoryItem;
  onClose: () => void;
}

export function GodModeContentPreview({ item, onClose }: GodModeContentPreviewProps) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [showHtml, setShowHtml] = useState(false);
  const { config } = useOptimizerStore();

  const content = item.generatedContent;

  // Prevent click events from bubbling through the portal overlay
  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  }, []);

  const handleCopyContent = async () => {
    if (!content?.content) return;

    try {
      await navigator.clipboard.writeText(content.content);
      toast.success('HTML content copied to clipboard!');
    } catch {
      toast.error('Failed to copy content');
    }
  };

  const handleCopyTitle = async () => {
    if (!content?.title) return;

    try {
      await navigator.clipboard.writeText(content.title);
      toast.success('Title copied!');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleManualPublish = async () => {
    if (!content?.content || !content?.title) {
      toast.error('No content to publish');
      return;
    }

    if (!config.wpUrl || !config.wpUsername || !config.wpAppPassword) {
      toast.error('WordPress credentials not configured. Go to Setup tab.');
      return;
    }

    setIsPublishing(true);

    try {
      const response = await fetch('/api/wordpress-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wpUrl: config.wpUrl,
          wpUsername: config.wpUsername,
          wpPassword: config.wpAppPassword,
          title: content.title,
          content: content.content,
          status: 'draft',
          seoTitle: content.seoTitle,
          metaDescription: content.metaDescription,
          slug: content.slug,
        }),
      });

      const result = await response.json();

      if (result.success && result.postUrl) {
        toast.success('Published to WordPress as draft!', {
          action: {
            label: 'View',
            onClick: () => window.open(result.postUrl, '_blank'),
          },
        });
        onClose();
      } else {
        throw new Error(result.error || 'Publishing failed');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Publishing failed');
    } finally {
      setIsPublishing(false);
    }
  };

  const getActionBadge = () => {
    switch (item.action) {
      case 'published':
        return <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Published
        </span>;
      case 'generated':
        return <span className="px-2 py-1 text-xs bg-blue-500/20 text-blue-400 rounded-full flex items-center gap-1">
          <FileText className="w-3 h-3" /> Generated
        </span>;
      case 'skipped':
        return <span className="px-2 py-1 text-xs bg-yellow-500/20 text-yellow-400 rounded-full flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Below Threshold
        </span>;
      default:
        return null;
    }
  };

  if (!content) {
    return createPortal(
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onMouseDown={stopPropagation}
      >
        <div className="bg-card border border-border rounded-2xl p-8 max-w-md text-center" onClick={stopPropagation}>
          <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">No Content Available</h3>
          <p className="text-muted-foreground mb-4">
            This history item doesn't have stored content. This may happen for older entries
            or items that encountered errors during generation.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium"
          >
            Close
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      onMouseDown={stopPropagation}
    >
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={stopPropagation}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center">
              <Eye className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Content Preview</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {getActionBadge()}
                {item.qualityScore && (
                  <span className={cn(
                    "px-2 py-0.5 text-xs rounded-full",
                    item.qualityScore >= 85 ? "bg-green-500/20 text-green-400" :
                      item.qualityScore >= 70 ? "bg-yellow-500/20 text-yellow-400" :
                        "bg-red-500/20 text-red-400"
                  )}>
                    Score: {item.qualityScore}%
                  </span>
                )}
                {item.wordCount && (
                  <span className="text-xs">{item.wordCount.toLocaleString()} words</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Meta Info Bar */}
        <div className="p-4 border-b border-border bg-muted/20 space-y-3">
          {/* Title */}
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <span className="text-xs text-muted-foreground block mb-1">Title</span>
              <p className="font-semibold text-foreground">{content.title}</p>
            </div>
            <button
              onClick={handleCopyTitle}
              className="p-2 text-muted-foreground hover:text-primary rounded-lg hover:bg-muted transition-colors"
              title="Copy title"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>

          {/* SEO Title & Meta */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-xs text-muted-foreground block mb-1">SEO Title</span>
              <p className="text-sm text-foreground truncate">{content.seoTitle || '—'}</p>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block mb-1">Meta Description</span>
              <p className="text-sm text-foreground truncate">{content.metaDescription || '—'}</p>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Toggle Buttons */}
          <div className="flex items-center gap-2 p-3 border-b border-border">
            <button
              onClick={() => setShowHtml(false)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                !showHtml ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Preview
            </button>
            <button
              onClick={() => setShowHtml(true)}
              className={cn(
                "px-3 py-1.5 text-sm rounded-lg transition-colors",
                showHtml ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              HTML Source
            </button>
          </div>

          {/* Content Display */}
          <div className="flex-1 overflow-y-auto p-4">
            {showHtml ? (
              <pre className="text-sm text-foreground whitespace-pre-wrap font-mono bg-muted/30 p-4 rounded-lg overflow-x-auto">
                {content.content}
              </pre>
            ) : (
              <div className="bg-white rounded-xl overflow-hidden shadow-lg ring-4 ring-black/10">
                <style dangerouslySetInnerHTML={{
                  __html: `
                  .gm-preview-content { max-width: 720px; margin: 0 auto; }
                  .gm-preview-content h1 { font-size: 32px; font-weight: 900; color: #0f172a; margin: 36px 0 18px; line-height: 1.2; letter-spacing: -0.03em; }
                  .gm-preview-content h2 { font-size: 26px; font-weight: 900; color: #0f172a; margin: 48px 0 20px; padding-bottom: 14px; border-bottom: 3px solid; border-image: linear-gradient(135deg, #10b981, #059669, #047857) 1; letter-spacing: -0.02em; line-height: 1.2; }
                  .gm-preview-content h3 { font-size: 21px; font-weight: 800; color: #1e293b; margin: 36px 0 16px; padding-left: 18px; border-left: 4px solid #10b981; line-height: 1.3; }
                  .gm-preview-content h4 { font-size: 18px; font-weight: 700; color: #334155; margin: 28px 0 12px; line-height: 1.35; }
                  .gm-preview-content p { margin: 0 0 20px; color: #334155; line-height: 1.85; font-size: 17px; }
                  .gm-preview-content strong, .gm-preview-content b { color: #0f172a; font-weight: 700; }
                  .gm-preview-content a { color: #059669; text-decoration: underline; text-decoration-color: rgba(5,150,105,0.3); text-underline-offset: 3px; font-weight: 600; }
                  .gm-preview-content a:hover { color: #047857; text-decoration-color: #059669; }
                  .gm-preview-content ul, .gm-preview-content ol { margin: 14px 0 24px; padding-left: 28px; color: #374151; }
                  .gm-preview-content li { margin-bottom: 10px; line-height: 1.85; font-size: 16px; }
                  .gm-preview-content blockquote { border-left: 5px solid #8b5cf6; margin: 28px 0; padding: 20px 24px; background: linear-gradient(135deg, #f5f3ff, #ede9fe); border-radius: 0 14px 14px 0; font-style: italic; color: #4c1d95; }
                  .gm-preview-content blockquote p { color: inherit; }
                  .gm-preview-content img { max-width: 100%; height: auto; border-radius: 14px; margin: 24px 0; }
                  .gm-preview-content figure { margin: 28px 0; }
                  .gm-preview-content figcaption { text-align: center; color: #6b7280; font-size: 13px; margin-top: 6px; font-style: italic; }
                  .gm-preview-content table { width: 100%; border-collapse: collapse; margin: 28px 0; font-size: 14px; }
                  .gm-preview-content th { background: linear-gradient(135deg, #0f172a, #1e293b); color: #f8fafc; padding: 14px 18px; text-align: left; font-weight: 700; }
                  .gm-preview-content td { padding: 12px 18px; border-top: 1px solid #e2e8f0; color: #374151; }
                  .gm-preview-content tr:nth-child(even) { background: #f8fafc; }
                  .gm-preview-content code { background: #f1f5f9; color: #be123c; padding: 2px 6px; border-radius: 5px; font-size: 0.88em; border: 1px solid #e2e8f0; }
                  .gm-preview-content pre { background: #0f172a; color: #e2e8f0; padding: 20px; border-radius: 14px; margin: 28px 0; overflow-x: auto; font-size: 13px; }
                  .gm-preview-content pre code { background: transparent; color: inherit; padding: 0; border: none; }
                  .gm-preview-content hr { border: none; height: 2px; background: linear-gradient(90deg, transparent, #e2e8f0 20%, #cbd5e1 50%, #e2e8f0 80%, transparent); margin: 40px 0; }
                  .gm-preview-content div[style] { max-width: 100%; box-sizing: border-box; overflow-wrap: break-word; }
                  .gm-preview-content iframe { max-width: 100%; border-radius: 10px; }
                  .gm-preview-content > p:first-child { font-size: 18px; color: #1e293b; line-height: 1.9; }
                  `}} />
                <article
                  className="gm-preview-content"
                  style={{ padding: '36px 44px', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', color: '#1a1a1a', lineHeight: 1.8, fontSize: '17px', backgroundColor: '#ffffff' }}
                  dangerouslySetInnerHTML={{ __html: content.content }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-muted/30">
          <div className="text-xs text-muted-foreground">
            Generated: {new Date(item.timestamp).toLocaleString()}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyContent}
              className="px-4 py-2 bg-muted text-foreground rounded-lg font-medium flex items-center gap-2 hover:bg-muted/80 transition-colors"
            >
              <Copy className="w-4 h-4" />
              Copy HTML
            </button>

            {item.wordPressUrl ? (
              <a
                href={item.wordPressUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg font-medium flex items-center gap-2 hover:bg-green-500/30 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                View on WordPress
              </a>
            ) : (
              <button
                onClick={handleManualPublish}
                disabled={isPublishing}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium flex items-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPublishing ? (
                  <>Publishing...</>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Publish to WordPress (Draft)
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
