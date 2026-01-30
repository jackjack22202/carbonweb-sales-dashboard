import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Redis } from '@upstash/redis';

const SETTINGS_KEY = 'dashboard_settings';

interface DashboardSettings {
  topDealsMinThreshold: number;
  cwGoal: number;
  aeGoal: number;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  excludedReps: string[];
}

const defaultSettings: DashboardSettings = {
  topDealsMinThreshold: 5000,
  cwGoal: 100000,
  aeGoal: 100000,
  primaryColor: '#8B5CF6',
  accentColor: '#14B8A6',
  backgroundColor: '#F9FAFB',
  excludedReps: []
};

// Initialize Redis client (uses UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars)
function getRedisClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    console.warn('Redis not configured - settings will use defaults');
    return null;
  }

  return new Redis({ url, token });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const redis = getRedisClient();

  try {
    if (req.method === 'GET') {
      if (!redis) {
        return res.status(200).json(defaultSettings);
      }

      const settings = await redis.get<DashboardSettings>(SETTINGS_KEY);
      return res.status(200).json(settings || defaultSettings);
    }

    if (req.method === 'POST') {
      const newSettings = req.body as Partial<DashboardSettings>;
      const mergedSettings = { ...defaultSettings, ...newSettings };

      if (redis) {
        await redis.set(SETTINGS_KEY, mergedSettings);
      }

      return res.status(200).json({ success: true, settings: mergedSettings });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Settings API error:', error);

    // Graceful degradation - return defaults on error
    if (req.method === 'GET') {
      return res.status(200).json(defaultSettings);
    }

    return res.status(500).json({
      error: 'Failed to process settings request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
