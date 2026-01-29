import { useState, useEffect, useCallback } from 'react';

export interface SalesRep {
  repId: string;
  name: string;
  initials: string;
  color: string;
  currentMonth: number;
  lastMonth: number;
}

export interface TopDeal {
  company: string;
  value: number;
  rep: { name: string; initials: string; color: string };
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

const API_URL = import.meta.env.PROD
  ? '/api/monday'
  : (import.meta.env.VITE_API_URL || '/api/monday');

export function useDashboardData(refreshInterval = 5 * 60 * 1000): UseDashboardDataResult {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(API_URL);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${response.status}`);
      }

      const result = await response.json();
      setData(result);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

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
