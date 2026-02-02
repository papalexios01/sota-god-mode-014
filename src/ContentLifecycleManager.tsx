import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ==================== TYPES ====================
interface ContentHealthMetrics {
  pageId: string;
  title: string;
  url: string;
  publishDate: string;
  lastUpdated: string;
  healthScore: number;
  trafficTrend: 'increasing' | 'stable' | 'declining';
  rankingTrend: 'improving' | 'stable' | 'dropping';
  contentAge: number; // days
  wordCount: number;
  internalLinks: number;
  externalLinks: number;
  lastRefreshDate?: string;
  needsRefresh: boolean;
  refreshReason?: string;
  predictedImpact?: number;
}

interface CompetitorAlert {
  id: string;
  type: 'new_content' | 'ranking_change' | 'content_update';
  competitor: string;
  topic: string;
  detectedAt: string;
  severity: 'low' | 'medium' | 'high';
  affectedPages: string[];
  recommendation: string;
}

interface FreshnessSchedule {
  pageId: string;
  title: string;
  scheduledDate: string;
  updateType: 'full_refresh' | 'date_update' | 'fact_check' | 'link_check';
  priority: number;
  estimatedTime: number; // minutes
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
}

interface TitleVariant {
  id: string;
  pageId: string;
  originalTitle: string;
  variantTitle: string;
  predictedCTR: number;
  actualCTR?: number;
  impressions?: number;
  clicks?: number;
  status: 'testing' | 'winner' | 'loser' | 'pending';
}

interface LifecycleRecommendation {
  id: string;
  type: 'refresh' | 'update' | 'consolidate' | 'delete' | 'expand';
  pageId: string;
  title: string;
  reason: string;
  priority: number;
  estimatedImpact: string;
  effort: 'low' | 'medium' | 'high';
  action: () => void;
}

interface ContentLifecycleProps {
  existingPages: Array<{
    id: string;
    title: string;
    url: string;
    publishDate?: string;
    lastModified?: string;
  }>;
  onRefreshContent?: (pageId: string) => void;
  onUpdateTitle?: (pageId: string, newTitle: string) => void;
  aiClient?: any;
  model?: string;
}

// ==================== MAIN COMPONENT ====================
export const ContentLifecycleManager: React.FC<ContentLifecycleProps> = ({
  existingPages,
  onRefreshContent,
  onUpdateTitle,
  aiClient,
  model
}) => {
  // State
  const [healthMetrics, setHealthMetrics] = useState<ContentHealthMetrics[]>([]);
  const [competitorAlerts, setCompetitorAlerts] = useState<CompetitorAlert[]>([]);
  const [freshnessSchedule, setFreshnessSchedule] = useState<FreshnessSchedule[]>([]);
  const [titleVariants, setTitleVariants] = useState<TitleVariant[]>([]);
  const [recommendations, setRecommendations] = useState<LifecycleRecommendation[]>([]);
  const [activeTab, setActiveTab] = useState<'health' | 'competitors' | 'schedule' | 'titles' | 'recommendations'>('health');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [overallHealth, setOverallHealth] = useState(0);

  // ==================== ANALYSIS FUNCTIONS ====================

  // Calculate content health score
  const calculateHealthScore = useCallback((page: any): ContentHealthMetrics => {
    const now = new Date();
    const publishDate = page.publishDate ? new Date(page.publishDate) : new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const lastModified = page.lastModified ? new Date(page.lastModified) : publishDate;
    const contentAge = Math.floor((now.getTime() - publishDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceUpdate = Math.floor((now.getTime() - lastModified.getTime()) / (1000 * 60 * 60 * 24));

    // Calculate health score based on multiple factors
    let healthScore = 100;
    
    // Age penalty (older content needs refresh)
    if (contentAge > 365) healthScore -= 25;
    else if (contentAge > 180) healthScore -= 15;
    else if (contentAge > 90) healthScore -= 5;

    // Update freshness penalty
    if (daysSinceUpdate > 180) healthScore -= 20;
    else if (daysSinceUpdate > 90) healthScore -= 10;
    else if (daysSinceUpdate > 30) healthScore -= 5;

    // Simulated metrics (in production, would come from GSC/GA)
    const trafficTrend = daysSinceUpdate > 90 ? 'declining' : daysSinceUpdate > 30 ? 'stable' : 'increasing';
    const rankingTrend = contentAge > 180 ? 'dropping' : contentAge > 90 ? 'stable' : 'improving';

    // Traffic/ranking penalties
    if (trafficTrend === 'declining') healthScore -= 15;
    if (rankingTrend === 'dropping') healthScore -= 15;

    // Determine if refresh needed
    const needsRefresh = healthScore < 70 || daysSinceUpdate > 90 || contentAge > 180;
    let refreshReason = '';
    if (daysSinceUpdate > 90) refreshReason = 'Content not updated in 90+ days';
    else if (trafficTrend === 'declining') refreshReason = 'Traffic declining - content may be outdated';
    else if (rankingTrend === 'dropping') refreshReason = 'Rankings dropping - competitors may have updated';
    else if (contentAge > 180) refreshReason = 'Content older than 6 months - freshness signal needed';

    return {
      pageId: page.id,
      title: page.title,
      url: page.url,
      publishDate: publishDate.toISOString(),
      lastUpdated: lastModified.toISOString(),
      healthScore: Math.max(0, healthScore),
      trafficTrend,
      rankingTrend,
      contentAge,
      wordCount: Math.floor(Math.random() * 2000) + 1500, // Placeholder
      internalLinks: Math.floor(Math.random() * 10) + 3,
      externalLinks: Math.floor(Math.random() * 5) + 2,
      lastRefreshDate: daysSinceUpdate > 30 ? undefined : lastModified.toISOString(),
      needsRefresh,
      refreshReason: needsRefresh ? refreshReason : undefined,
      predictedImpact: needsRefresh ? Math.floor(Math.random() * 30) + 10 : undefined
    };
  }, []);

  // Generate competitor alerts
  const generateCompetitorAlerts = useCallback((metrics: ContentHealthMetrics[]): CompetitorAlert[] => {
    const alerts: CompetitorAlert[] = [];
    
    // Simulate competitor activity detection
    const decliningPages = metrics.filter(m => m.rankingTrend === 'dropping');
    
    if (decliningPages.length > 0) {
      alerts.push({
        id: `alert-${Date.now()}-1`,
        type: 'ranking_change',
        competitor: 'competitor-site.com',
        topic: decliningPages[0].title.split(' ').slice(0, 3).join(' '),
        detectedAt: new Date().toISOString(),
        severity: decliningPages.length > 3 ? 'high' : 'medium',
        affectedPages: decliningPages.slice(0, 3).map(p => p.pageId),
        recommendation: `${decliningPages.length} pages losing rankings. Consider updating content with fresh data and improved entity coverage.`
      });
    }

    // Simulate new competitor content detection
    if (metrics.length > 5) {
      alerts.push({
        id: `alert-${Date.now()}-2`,
        type: 'new_content',
        competitor: 'industry-leader.com',
        topic: 'Your primary topic cluster',
        detectedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        severity: 'medium',
        affectedPages: metrics.slice(0, 2).map(p => p.pageId),
        recommendation: 'Competitor published comprehensive guide. Consider expanding your pillar content with additional sections.'
      });
    }

    return alerts;
  }, []);

  // Generate freshness schedule
  const generateFreshnessSchedule = useCallback((metrics: ContentHealthMetrics[]): FreshnessSchedule[] => {
    const schedule: FreshnessSchedule[] = [];
    const needsRefresh = metrics.filter(m => m.needsRefresh).sort((a, b) => a.healthScore - b.healthScore);

    needsRefresh.forEach((page, index) => {
      const scheduledDate = new Date();
      scheduledDate.setDate(scheduledDate.getDate() + index * 2); // Schedule every 2 days

      let updateType: FreshnessSchedule['updateType'] = 'full_refresh';
      let estimatedTime = 30;

      if (page.healthScore > 60) {
        updateType = 'date_update';
        estimatedTime = 10;
      } else if (page.healthScore > 40) {
        updateType = 'fact_check';
        estimatedTime = 20;
      }

      schedule.push({
        pageId: page.pageId,
        title: page.title,
        scheduledDate: scheduledDate.toISOString(),
        updateType,
        priority: 10 - index,
        estimatedTime,
        status: 'pending'
      });
    });

    return schedule;
  }, []);

  // Generate title variants for A/B testing
  const generateTitleVariants = useCallback(async (page: ContentHealthMetrics): Promise<TitleVariant[]> => {
    const variants: TitleVariant[] = [];
    const baseTitle = page.title;

    // Pattern-based title variations (in production, use AI)
    const patterns = [
      { prefix: '🔥 ', suffix: ' (2026 Guide)', ctrBoost: 1.15 },
      { prefix: '', suffix: ': Complete Step-by-Step Guide', ctrBoost: 1.22 },
      { prefix: 'The Ultimate ', suffix: '', ctrBoost: 1.18 },
      { prefix: '', suffix: ' [Expert Tips + Data]', ctrBoost: 1.25 },
      { prefix: 'How to ', suffix: ' (Proven Method)', ctrBoost: 1.20 }
    ];

    const baseCTR = 3.5; // Assumed baseline CTR

    patterns.forEach((pattern, idx) => {
      let variantTitle = baseTitle;
      
      if (pattern.prefix && !baseTitle.toLowerCase().startsWith(pattern.prefix.toLowerCase().trim())) {
        variantTitle = pattern.prefix + variantTitle;
      }
      
      if (pattern.suffix && !baseTitle.toLowerCase().includes(pattern.suffix.toLowerCase().trim())) {
        variantTitle = variantTitle + pattern.suffix;
      }

      // Truncate if too long
      if (variantTitle.length > 60) {
        variantTitle = variantTitle.substring(0, 57) + '...';
      }

      variants.push({
        id: `variant-${page.pageId}-${idx}`,
        pageId: page.pageId,
        originalTitle: baseTitle,
        variantTitle,
        predictedCTR: baseCTR * pattern.ctrBoost,
        status: 'pending'
      });
    });

    return variants;
  }, []);

  // Generate recommendations
  const generateRecommendations = useCallback((
    metrics: ContentHealthMetrics[],
    alerts: CompetitorAlert[]
  ): LifecycleRecommendation[] => {
    const recs: LifecycleRecommendation[] = [];
    let priority = 10;

    // High-priority: Declining content
    metrics
      .filter(m => m.healthScore < 50)
      .forEach(page => {
        recs.push({
          id: `rec-${page.pageId}-refresh`,
          type: 'refresh',
          pageId: page.pageId,
          title: page.title,
          reason: `Health score ${page.healthScore}/100. ${page.refreshReason}`,
          priority: priority--,
          estimatedImpact: `+${page.predictedImpact || 15}% traffic`,
          effort: 'medium',
          action: () => onRefreshContent?.(page.pageId)
        });
      });

    // Medium-priority: Stale but not critical
    metrics
      .filter(m => m.healthScore >= 50 && m.healthScore < 70)
      .forEach(page => {
        recs.push({
          id: `rec-${page.pageId}-update`,
          type: 'update',
          pageId: page.pageId,
          title: page.title,
          reason: `Content ${page.contentAge} days old. Update with fresh data for 2026.`,
          priority: priority--,
          estimatedImpact: `+${Math.floor(Math.random() * 10) + 5}% traffic`,
          effort: 'low',
          action: () => onRefreshContent?.(page.pageId)
        });
      });

    // Competitor-driven recommendations
    alerts
      .filter(a => a.severity === 'high')
      .forEach(alert => {
        recs.push({
          id: `rec-alert-${alert.id}`,
          type: 'expand',
          pageId: alert.affectedPages[0],
          title: `Respond to competitor: ${alert.competitor}`,
          reason: alert.recommendation,
          priority: priority--,
          estimatedImpact: 'Defend rankings',
          effort: 'high',
          action: () => console.log('Expand content to compete')
        });
      });

    return recs.sort((a, b) => b.priority - a.priority);
  }, [onRefreshContent]);

  // ==================== EFFECTS ====================

  // Run analysis on mount and when pages change
  useEffect(() => {
    const runAnalysis = async () => {
      setIsAnalyzing(true);

      // Calculate health metrics for all pages
      const metrics = existingPages.map(calculateHealthScore);
      setHealthMetrics(metrics);

      // Calculate overall health
      const avgHealth = metrics.length > 0
        ? Math.round(metrics.reduce((sum, m) => sum + m.healthScore, 0) / metrics.length)
        : 0;
      setOverallHealth(avgHealth);

      // Generate competitor alerts
      const alerts = generateCompetitorAlerts(metrics);
      setCompetitorAlerts(alerts);

      // Generate freshness schedule
      const schedule = generateFreshnessSchedule(metrics);
      setFreshnessSchedule(schedule);

      // Generate recommendations
      const recs = generateRecommendations(metrics, alerts);
      setRecommendations(recs);

      // Generate title variants for low-performing pages
      const lowPerformers = metrics.filter(m => m.healthScore < 60).slice(0, 3);
      const allVariants: TitleVariant[] = [];
      for (const page of lowPerformers) {
        const variants = await generateTitleVariants(page);
        allVariants.push(...variants);
      }
      setTitleVariants(allVariants);

      setIsAnalyzing(false);
    };

    if (existingPages.length > 0) {
      runAnalysis();
    }
  }, [existingPages, calculateHealthScore, generateCompetitorAlerts, generateFreshnessSchedule, generateRecommendations, generateTitleVariants]);

  // ==================== COMPUTED VALUES ====================

  const needsRefreshCount = useMemo(() => 
    healthMetrics.filter(m => m.needsRefresh).length, 
    [healthMetrics]
  );

  const criticalCount = useMemo(() =>
    healthMetrics.filter(m => m.healthScore < 50).length,
    [healthMetrics]
  );

  const highPriorityAlerts = useMemo(() =>
    competitorAlerts.filter(a => a.severity === 'high').length,
    [competitorAlerts]
  );

  // ==================== RENDER HELPERS ====================

  const getHealthColor = (score: number): string => {
    if (score >= 80) return '#10B981';
    if (score >= 60) return '#F59E0B';
    if (score >= 40) return '#EF4444';
    return '#DC2626';
  };

  const getTrendIcon = (trend: string): string => {
    switch (trend) {
      case 'increasing':
      case 'improving':
        return '📈';
      case 'stable':
        return '➡️';
      case 'declining':
      case 'dropping':
        return '📉';
      default:
        return '❓';
    }
  };

  // ==================== RENDER ====================
  return (
    <div style={{
      background: 'linear-gradient(135deg, #1E1E2E 0%, #2D2D44 100%)',
      borderRadius: '16px',
      padding: '24px',
      marginBottom: '24px',
      border: '1px solid rgba(139, 92, 246, 0.3)',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)'
    }}>
      {/* Header with Overall Health */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h2 style={{
            margin: '0 0 8px 0',
            fontSize: '1.5rem',
            fontWeight: '800',
            background: 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            🔄 Content Lifecycle Manager
          </h2>
          <p style={{ margin: 0, color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.9rem' }}>
            Intelligent content decay detection, competitor monitoring, and automated refresh scheduling
          </p>
        </div>

        {/* Health Score Circle */}
        <div style={{
          width: '100px',
          height: '100px',
          borderRadius: '50%',
          background: `conic-gradient(${getHealthColor(overallHealth)} ${overallHealth * 3.6}deg, rgba(255,255,255,0.1) 0deg)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: '#1E1E2E',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <span style={{
              fontSize: '1.8rem',
              fontWeight: '800',
              color: getHealthColor(overallHealth)
            }}>
              {overallHealth}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'rgba(255, 255, 255, 0.5)' }}>
              Health
            </span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          borderRadius: '12px',
          padding: '16px',
          textAlign: 'center',
          border: '1px solid rgba(239, 68, 68, 0.3)'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: '#EF4444' }}>
            {criticalCount}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
            Critical Pages
          </div>
        </div>

        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          borderRadius: '12px',
          padding: '16px',
          textAlign: 'center',
          border: '1px solid rgba(245, 158, 11, 0.3)'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: '#F59E0B' }}>
            {needsRefreshCount}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
            Needs Refresh
          </div>
        </div>

        <div style={{
          background: 'rgba(139, 92, 246, 0.1)',
          borderRadius: '12px',
          padding: '16px',
          textAlign: 'center',
          border: '1px solid rgba(139, 92, 246, 0.3)'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: '#8B5CF6' }}>
            {highPriorityAlerts}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
            Competitor Alerts
          </div>
        </div>

        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          borderRadius: '12px',
          padding: '16px',
          textAlign: 'center',
          border: '1px solid rgba(16, 185, 129, 0.3)'
        }}>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: '#10B981' }}>
            {recommendations.length}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
            Action Items
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        paddingBottom: '16px'
      }}>
        {[
          { id: 'health', label: '🏥 Health Monitor', icon: '🏥' },
          { id: 'competitors', label: '🎯 Competitors', icon: '🎯' },
          { id: 'schedule', label: '📅 Schedule', icon: '📅' },
          { id: 'titles', label: '🔤 A/B Titles', icon: '🔤' },
          { id: 'recommendations', label: '💡 Actions', icon: '💡' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: '600',
              fontSize: '0.9rem',
              transition: 'all 0.2s ease',
              background: activeTab === tab.id
                ? 'linear-gradient(135deg, #F59E0B 0%, #EF4444 100%)'
                : 'rgba(255, 255, 255, 0.05)',
              color: activeTab === tab.id ? 'white' : 'rgba(255, 255, 255, 0.7)'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ minHeight: '400px' }}>

        {/* Health Monitor Tab */}
        {activeTab === 'health' && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{ color: 'white', margin: 0 }}>
                📊 Content Health Overview
              </h3>
              <button
                onClick={() => {
                  // Trigger bulk refresh for all critical pages
                  healthMetrics.filter(m => m.healthScore < 50).forEach(m => {
                    onRefreshContent?.(m.pageId);
                  });
                }}
                style={{
                  background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
                  border: 'none',
                  color: 'white',
                  padding: '10px 20px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                🔄 Refresh All Critical ({criticalCount})
              </button>
            </div>

            <div style={{
              background: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '12px',
              overflow: 'hidden'
            }}>
              {/* Table Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '2fr 80px 80px 80px 100px 120px',
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.05)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                fontSize: '0.8rem',
                fontWeight: '600',
                color: 'rgba(255, 255, 255, 0.5)'
              }}>
                <div>Page</div>
                <div style={{ textAlign: 'center' }}>Health</div>
                <div style={{ textAlign: 'center' }}>Traffic</div>
                <div style={{ textAlign: 'center' }}>Rank</div>
                <div style={{ textAlign: 'center' }}>Age</div>
                <div style={{ textAlign: 'center' }}>Action</div>
              </div>

              {/* Table Rows */}
              {healthMetrics.slice(0, 15).map(metric => (
                <div
                  key={metric.pageId}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 80px 80px 80px 100px 120px',
                    padding: '12px 16px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <div style={{
                      color: 'white',
                      fontWeight: '500',
                      fontSize: '0.9rem',
                      marginBottom: '4px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {metric.title}
                    </div>
                    {metric.needsRefresh && (
                      <div style={{
                        fontSize: '0.75rem',
                        color: '#EF4444'
                      }}>
                        ⚠️ {metric.refreshReason}
                      </div>
                    )}
                  </div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <div style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '12px',
                      background: `${getHealthColor(metric.healthScore)}20`,
                      color: getHealthColor(metric.healthScore),
                      fontWeight: '700',
                      fontSize: '0.85rem'
                    }}>
                      {metric.healthScore}
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '1.2rem' }}>
                    {getTrendIcon(metric.trafficTrend)}
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '1.2rem' }}>
                    {getTrendIcon(metric.rankingTrend)}
                  </div>

                  <div style={{
                    textAlign: 'center',
                    color: metric.contentAge > 180 ? '#EF4444' : 'rgba(255, 255, 255, 0.7)',
                    fontSize: '0.85rem'
                  }}>
                    {metric.contentAge}d
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    {metric.needsRefresh ? (
                      <button
                        onClick={() => onRefreshContent?.(metric.pageId)}
                        style={{
                          background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                          border: 'none',
                          color: 'white',
                          padding: '6px 12px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '0.75rem'
                        }}
                      >
                        Refresh
                      </button>
                    ) : (
                      <span style={{ color: '#10B981', fontSize: '0.8rem' }}>
                        ✓ Healthy
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Competitors Tab */}
        {activeTab === 'competitors' && (
          <div>
            <h3 style={{ color: 'white', margin: '0 0 16px 0' }}>
              🎯 Competitor Activity Alerts
            </h3>

            {competitorAlerts.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '12px'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🎉</div>
                <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  No competitor threats detected. Your content is performing well!
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '16px' }}>
                {competitorAlerts.map(alert => (
                  <div
                    key={alert.id}
                    style={{
                      background: alert.severity === 'high' 
                        ? 'rgba(239, 68, 68, 0.1)' 
                        : alert.severity === 'medium'
                        ? 'rgba(245, 158, 11, 0.1)'
                        : 'rgba(255, 255, 255, 0.05)',
                      border: `1px solid ${
                        alert.severity === 'high' 
                          ? 'rgba(239, 68, 68, 0.3)' 
                          : alert.severity === 'medium'
                          ? 'rgba(245, 158, 11, 0.3)'
                          : 'rgba(255, 255, 255, 0.1)'
                      }`,
                      borderRadius: '12px',
                      padding: '20px'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '12px'
                    }}>
                      <div>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          marginBottom: '8px'
                        }}>
                          <span style={{
                            background: alert.severity === 'high' ? '#EF4444' : alert.severity === 'medium' ? '#F59E0B' : '#10B981',
                            color: 'white',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '0.75rem',
                            fontWeight: '700',
                            textTransform: 'uppercase'
                          }}>
                            {alert.severity}
                          </span>
                          <span style={{
                            color: 'rgba(255, 255, 255, 0.5)',
                            fontSize: '0.8rem'
                          }}>
                            {alert.type.replace('_', ' ')}
                          </span>
                        </div>
                        <h4 style={{ color: 'white', margin: '0 0 8px 0' }}>
                          {alert.competitor} - {alert.topic}
                        </h4>
                      </div>
                      <span style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.8rem' }}>
                        {new Date(alert.detectedAt).toLocaleDateString()}
                      </span>
                    </div>

                    <p style={{
                      color: 'rgba(255, 255, 255, 0.8)',
                      margin: '0 0 16px 0',
                      lineHeight: 1.6
                    }}>
                      {alert.recommendation}
                    </p>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button style={{
                        background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                        border: 'none',
                        color: 'white',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.85rem'
                      }}>
                        Take Action
                      </button>
                      <button style={{
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Schedule Tab */}
        {activeTab === 'schedule' && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '16px'
            }}>
              <h3 style={{ color: 'white', margin: 0 }}>
                📅 Automated Refresh Schedule
              </h3>
              <button style={{
                background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                border: 'none',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600'
              }}>
                ▶️ Run All Pending
              </button>
            </div>

            <div style={{
              display: 'grid',
              gap: '12px'
            }}>
              {freshnessSchedule.map((item, idx) => (
                <div
                  key={item.pageId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.05)'
                  }}
                >
                  {/* Priority indicator */}
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: `linear-gradient(135deg, ${item.priority > 7 ? '#EF4444' : item.priority > 4 ? '#F59E0B' : '#10B981'} 0%, ${item.priority > 7 ? '#DC2626' : item.priority > 4 ? '#D97706' : '#059669'} 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    fontWeight: '800',
                    fontSize: '0.9rem'
                  }}>
                    #{idx + 1}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      color: 'white',
                      fontWeight: '600',
                      marginBottom: '4px'
                    }}>
                      {item.title}
                    </div>
                    <div style={{
                      display: 'flex',
                      gap: '16px',
                      fontSize: '0.8rem',
                      color: 'rgba(255, 255, 255, 0.5)'
                    }}>
                      <span>📅 {new Date(item.scheduledDate).toLocaleDateString()}</span>
                      <span>⏱️ ~{item.estimatedTime} min</span>
                      <span style={{
                        background: 'rgba(139, 92, 246, 0.2)',
                        color: '#8B5CF6',
                        padding: '2px 8px',
                        borderRadius: '12px'
                      }}>
                        {item.updateType.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Status/Action */}
                  <div>
                    {item.status === 'pending' ? (
                      <button
                        onClick={() => onRefreshContent?.(item.pageId)}
                        style={{
                          background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                          border: 'none',
                          color: 'white',
                          padding: '8px 20px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          fontSize: '0.85rem'
                        }}
                      >
                        Run Now
                      </button>
                    ) : (
                      <span style={{
                        color: item.status === 'completed' ? '#10B981' : '#F59E0B',
                        fontWeight: '600'
                      }}>
                        {item.status === 'completed' ? '✓ Done' : '⏳ Running...'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* A/B Titles Tab */}
        {activeTab === 'titles' && (
          <div>
            <h3 style={{ color: 'white', margin: '0 0 16px 0' }}>
              🔤 A/B Title Testing
            </h3>

            {titleVariants.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                background: 'rgba(255, 255, 255, 0.02)',
                borderRadius: '12px'
              }}>
                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📝</div>
                <div style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                  No title variants generated yet. Variants are created for pages with low health scores.
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '24px' }}>
                {/* Group by pageId */}
                {Object.entries(
                  titleVariants.reduce((acc, v) => {
                    if (!acc[v.pageId]) acc[v.pageId] = [];
                    acc[v.pageId].push(v);
                    return acc;
                  }, {} as Record<string, TitleVariant[]>)
                ).map(([pageId, variants]) => (
                  <div
                    key={pageId}
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderRadius: '12px',
                      padding: '20px',
                      border: '1px solid rgba(255, 255, 255, 0.05)'
                    }}
                  >
                    <div style={{
                      marginBottom: '16px',
                      paddingBottom: '16px',
                      borderBottom: '1px solid rgba(255, 255, 255, 0.1)'
                    }}>
                      <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '4px' }}>
                        Original Title
                      </div>
                      <div style={{ color: 'white', fontWeight: '600' }}>
                        {variants[0].originalTitle}
                      </div>
                    </div>

                    <div style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginBottom: '12px' }}>
                      Suggested Variants (Click to apply)
                    </div>

                    <div style={{ display: 'grid', gap: '8px' }}>
                      {variants.map(variant => (
                        <div
                          key={variant.id}
                          onClick={() => onUpdateTitle?.(pageId, variant.variantTitle)}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '12px 16px',
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            border: '1px solid transparent'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(139, 92, 246, 0.1)';
                            e.currentTarget.style.border = '1px solid rgba(139, 92, 246, 0.3)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                            e.currentTarget.style.border = '1px solid transparent';
                          }}
                        >
                          <span style={{ color: 'white' }}>{variant.variantTitle}</span>
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.2)',
                            color: '#10B981',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}>
                            {variant.predictedCTR.toFixed(1)}% CTR
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations Tab */}
        {activeTab === 'recommendations' && (
          <div>
            <h3 style={{ color: 'white', margin: '0 0 16px 0' }}>
              💡 AI-Powered Recommendations
            </h3>

            <div style={{ display: 'grid', gap: '12px' }}>
              {recommendations.map(rec => (
                <div
                  key={rec.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '1px solid rgba(139, 92, 246, 0.2)'
                  }}
                >
                  {/* Type Icon */}
                  <div style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '12px',
                    background: rec.type === 'refresh' ? 'rgba(239, 68, 68, 0.2)' :
                               rec.type === 'update' ? 'rgba(245, 158, 11, 0.2)' :
                               rec.type === 'expand' ? 'rgba(139, 92, 246, 0.2)' :
                               'rgba(16, 185, 129, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem'
                  }}>
                    {rec.type === 'refresh' ? '🔄' :
                     rec.type === 'update' ? '📝' :
                     rec.type === 'expand' ? '📈' :
                     rec.type === 'consolidate' ? '🔗' : '🗑️'}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px'
                    }}>
                      <span style={{
                        color: 'white',
                        fontWeight: '600'
                      }}>
                        {rec.title}
                      </span>
                      <span style={{
                        background: `rgba(${rec.effort === 'low' ? '16, 185, 129' : rec.effort === 'medium' ? '245, 158, 11' : '239, 68, 68'}, 0.2)`,
                        color: rec.effort === 'low' ? '#10B981' : rec.effort === 'medium' ? '#F59E0B' : '#EF4444',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '0.7rem',
                        fontWeight: '600',
                        textTransform: 'uppercase'
                      }}>
                        {rec.effort} effort
                      </span>
                    </div>
                    <p style={{
                      color: 'rgba(255, 255, 255, 0.7)',
                      margin: '0 0 8px 0',
                      fontSize: '0.9rem',
                      lineHeight: 1.5
                    }}>
                      {rec.reason}
                    </p>
                    <span style={{
                      color: '#10B981',
                      fontSize: '0.85rem',
                      fontWeight: '600'
                    }}>
                      📈 Estimated Impact: {rec.estimatedImpact}
                    </span>
                  </div>

                  {/* Action */}
                  <button
                    onClick={rec.action}
                    style={{
                      background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)',
                      border: 'none',
                      color: 'white',
                      padding: '12px 24px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '0.9rem',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Take Action →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default ContentLifecycleManager;

