import type { VercelRequest, VercelResponse } from '@vercel/node';

// Use a global settings key - stored in Vercel KV or environment
// This ensures ALL users see the same settings regardless of who saved them
const SETTINGS_KEY = 'global_dashboard_settings';

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

// In-memory cache for settings (shared across requests in the same serverless instance)
// For true persistence, this is also stored in Vercel KV if available
let cachedSettings: DashboardSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 1 minute cache

// Try to use Vercel KV for persistent storage, fall back to in-memory
async function getStoredSettings(): Promise<DashboardSettings | null> {
  // Check in-memory cache first
  if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedSettings;
  }

  // Try Vercel KV if available
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      const response = await fetch(`${kvUrl}/get/${SETTINGS_KEY}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          const settings = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;
          cachedSettings = settings;
          cacheTimestamp = Date.now();
          return settings;
        }
      }
    } catch (e) {
      console.warn('KV read failed, using cache/defaults:', e);
    }
  }

  return cachedSettings;
}

async function saveStoredSettings(settings: DashboardSettings): Promise<boolean> {
  // Always update in-memory cache
  cachedSettings = settings;
  cacheTimestamp = Date.now();

  // Try to persist to Vercel KV if available
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (kvUrl && kvToken) {
    try {
      const response = await fetch(`${kvUrl}/set/${SETTINGS_KEY}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${kvToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });
      return response.ok;
    } catch (e) {
      console.warn('KV write failed:', e);
    }
  }

  // Even without KV, in-memory cache will work for the serverless instance lifetime
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Get globally shared settings
      const stored = await getStoredSettings();

      if (stored) {
        return res.status(200).json({ ...defaultSettings, ...stored, _source: 'global' });
      }

      // No settings stored yet - return defaults
      return res.status(200).json({ ...defaultSettings, _source: 'defaults' });
    }

    if (req.method === 'POST') {
      // Save settings globally (any authenticated user can save)
      const newSettings = req.body as Partial<DashboardSettings>;
      const mergedSettings = { ...defaultSettings, ...newSettings };

      // Remove internal fields before storing
      const { _source, ...settingsToStore } = mergedSettings as any;

      const success = await saveStoredSettings(settingsToStore);

      if (success) {
        return res.status(200).json({ success: true, settings: settingsToStore });
      } else {
        return res.status(500).json({ error: 'Failed to save settings' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Settings API error:', error);

    // Graceful degradation - return defaults on error for GET
    if (req.method === 'GET') {
      return res.status(200).json({ ...defaultSettings, _source: 'error-fallback' });
    }

    return res.status(500).json({
      error: 'Failed to process settings request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
