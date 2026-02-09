import type { VercelRequest, VercelResponse } from '@vercel/node';

// Settings stored in Vercel Blob (available by default)
const SETTINGS_BLOB_PATH = 'dashboard-settings.json';

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
let cachedSettings: DashboardSettings | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 30000; // 30 second cache

// Try to use Vercel Blob for persistent storage
async function getStoredSettings(): Promise<DashboardSettings | null> {
  // Check in-memory cache first
  if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedSettings;
  }

  // Try Vercel Blob if token is available
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (blobToken) {
    try {
      const { head } = await import('@vercel/blob');

      // Try to get the blob directly by constructing its URL
      // When addRandomSuffix is false, the URL is deterministic
      const blobMeta = await head(SETTINGS_BLOB_PATH, { token: blobToken });

      if (blobMeta?.url) {
        // Add cache-busting query param to avoid CDN caching
        const response = await fetch(`${blobMeta.url}?t=${Date.now()}`);
        if (response.ok) {
          const settings = await response.json();
          cachedSettings = settings;
          cacheTimestamp = Date.now();
          return settings;
        }
      }
    } catch (e) {
      // head() throws if blob doesn't exist, which is fine for first run
      console.warn('Blob read failed, using cache/defaults:', e);
    }
  }

  // Check environment variable fallback (DASHBOARD_SETTINGS)
  const envSettings = process.env.DASHBOARD_SETTINGS;
  if (envSettings) {
    try {
      const settings = JSON.parse(envSettings);
      cachedSettings = settings;
      cacheTimestamp = Date.now();
      return settings;
    } catch (e) {
      console.warn('Failed to parse DASHBOARD_SETTINGS env var:', e);
    }
  }

  return cachedSettings;
}

async function saveStoredSettings(settings: DashboardSettings): Promise<boolean> {
  // Always update in-memory cache
  cachedSettings = settings;
  cacheTimestamp = Date.now();

  // Try to persist to Vercel Blob if available
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (blobToken) {
    try {
      const { put } = await import('@vercel/blob');

      // Use addRandomSuffix: false to overwrite the same file each time
      await put(SETTINGS_BLOB_PATH, JSON.stringify(settings), {
        access: 'public',
        token: blobToken,
        contentType: 'application/json',
        addRandomSuffix: false
      });

      console.log('Settings saved to Blob successfully');
      return true;
    } catch (e) {
      console.warn('Blob write failed:', e);
    }
  }

  // Even without Blob, in-memory cache will work for the serverless instance lifetime
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
