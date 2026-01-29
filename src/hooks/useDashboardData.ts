import { useState, useEffect, useCallback } from 'react';

export interface SalesRep {
  repId: string;
  name: string;
  initials: string;
  color: string;
  photoUrl: string | null;
  currentMonth: number;
  currentMonthCW: number;
  currentMonthAE: number;
  lastMonth: number;
}

export interface SEInfo {
  name: string;
  initials: string;
  color: string;
  photoUrl: string | null;
}

export interface TopDeal {
  company: string;
  value: number;
  rep: { name: string; initials: string; color: string; photoUrl: string | null };
  se: SEInfo | null;
  scopeId: string | null;
}

export interface TargetData {
  current: number;
  goal: number;
  label: string;
}

export interface NewsItem {
  id: number;
  type: 'win' | 'stats' | 'alert' | 'update';
  emoji: string;
  headline: string;
  body: string;
  timestamp: string;
  rep: { name: string; initials: string; color: string } | null;
}

export interface DashboardData {
  salesReps: SalesRep[];
  topDeals: {
    thisWeek: TopDeal | null;
    lastWeek: TopDeal | null;
  };
  cwTarget: TargetData;
  aeTarget: TargetData;
  news: NewsItem[];
}

interface UseDashboardDataResult {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

const API_BASE_URL = import.meta.env.PROD
  ? '/api/monday'
  : (import.meta.env.VITE_API_URL || '/api/monday');

const NEWS_API_URL = import.meta.env.PROD
  ? '/api/generate-news'
  : (import.meta.env.VITE_NEWS_API_URL || '/api/generate-news');

interface UseDashboardOptions {
  refreshInterval?: number;
  minThreshold?: number;
}

export function useDashboardData(options: UseDashboardOptions = {}): UseDashboardDataResult {
  const { refreshInterval = 5 * 60 * 1000, minThreshold = 0 } = options;
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Build URL with query parameters
      const url = new URL(API_BASE_URL, window.location.origin);
      if (minThreshold > 0) {
        url.searchParams.set('minThreshold', minThreshold.toString());
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const result = await response.json();

      // Try to fetch AI-generated news (non-blocking)
      try {
        // Extract deal info from the basic news for AI generation
        const deals = result.news?.map((n: NewsItem) => ({
          repName: n.rep?.name || 'Unknown',
          company: n.headline.match(/closes ([^for]+) for/)?.[1] || 'Deal',
          value: parseInt(n.headline.match(/\$([0-9,]+)/)?.[1]?.replace(/,/g, '') || '0'),
          timestamp: n.timestamp
        })).filter((d: { value: number }) => d.value > 0).slice(0, 6) || [];

        const totalThisMonth = result.salesReps?.reduce((sum: number, r: SalesRep) => sum + r.currentMonth, 0) || 0;
        const goalPercentage = result.cwTarget?.goal ? Math.round((totalThisMonth / result.cwTarget.goal) * 100) : 0;

        if (deals.length > 0) {
          const newsResponse = await fetch(new URL(NEWS_API_URL, window.location.origin).toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              deals,
              teamStats: goalPercentage > 50 ? { totalThisMonth, goalPercentage } : undefined
            })
          });

          if (newsResponse.ok) {
            const newsResult = await newsResponse.json();
            if (newsResult.news && newsResult.news.length > 0) {
              // Merge AI news with rep info from original data
              result.news = newsResult.news.map((n: NewsItem, i: number) => {
                const originalNews = result.news?.[i];
                return {
                  ...n,
                  rep: originalNews?.rep || n.rep
                };
              });
            }
          }
        }
      } catch (newsErr) {
        console.warn('AI news generation failed, using default news:', newsErr);
        // Continue with default news from Monday API
      }

      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [minThreshold]);

  useEffect(() => {
    fetchData();

    if (refreshInterval > 0) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return {
    data,
    loading,
    error,
    refresh: fetchData,
    lastUpdated
  };
}
