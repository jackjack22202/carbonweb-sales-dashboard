import type { VercelRequest, VercelResponse } from '@vercel/node';

const SETTINGS_BLOB_NAME = 'dashboard-settings.json';

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

// In-memory cache with short TTL
let cachedSettings: DashboardSettings | null = null;
let cachedBlobUrl: string | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 10000; // 10 second cache

async function getStoredSettings(): Promise<DashboardSettings | null> {
  // Check in-memory cache first
  if (cachedSettings && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedSettings;
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (blobToken) {
    try {
      const { list } = await import('@vercel/blob');

      // List all blobs and find our settings file
      const { blobs } = await list({ token: blobToken });
      const settingsBlob = blobs.find(b => b.pathname === SETTINGS_BLOB_NAME);

      if (settingsBlob) {
        cachedBlobUrl = settingsBlob.url;
        // Fetch with cache-busting
        const response = await fetch(`${settingsBlob.url}?t=${Date.now()}`);
        if (response.ok) {
          const settings = await response.json();
          cachedSettings = settings;
          cacheTimestamp = Date.now();
          return settings;
        }
      }
    } catch (e) {
      console.error('Blob read error:', e);
    }
  }

  // Fallback to environment variable
  const envSettings = process.env.DASHBOARD_SETTINGS;
  if (envSettings) {
    try {
      return JSON.parse(envSettings);
    } catch (e) {
      console.warn('Failed to parse DASHBOARD_SETTINGS:', e);
    }
  }

  return cachedSettings;
}

async function saveStoredSettings(settings: DashboardSettings): Promise<boolean> {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;

  if (blobToken) {
    try {
      const { put, del, list } = await import('@vercel/blob');

      // First, delete any existing settings blobs
      const { blobs } = await list({ token: blobToken });
      const existingBlobs = blobs.filter(b => b.pathname === SETTINGS_BLOB_NAME || b.pathname.startsWith('dashboard-settings'));

      for (const blob of existingBlobs) {
        await del(blob.url, { token: blobToken });
      }

      // Now create new blob
      const result = await put(SETTINGS_BLOB_NAME, JSON.stringify(settings), {
        access: 'public',
        token: blobToken,
        contentType: 'application/json',
        addRandomSuffix: false
      });

      console.log('Settings saved to Blob:', result.url);

      // Update cache immediately
      cachedSettings = settings;
      cachedBlobUrl = result.url;
      cacheTimestamp = Date.now();

      return true;
    } catch (e) {
      console.error('Blob write error:', e);
      return false;
    }
  }

  // No blob token - just cache in memory
  cachedSettings = settings;
  cacheTimestamp = Date.now();
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
      const stored = await getStoredSettings();

      if (stored) {
        return res.status(200).json({ ...defaultSettings, ...stored, _source: 'global' });
      }

      return res.status(200).json({ ...defaultSettings, _source: 'defaults' });
    }

    if (req.method === 'POST') {
      const newSettings = req.body as Partial<DashboardSettings>;
      const mergedSettings = { ...defaultSettings, ...newSettings };

      // Remove internal fields
      const { _source, ...settingsToStore } = mergedSettings as any;

      const success = await saveStoredSettings(settingsToStore);

      if (success) {
        return res.status(200).json({ success: true, settings: settingsToStore });
      } else {
        return res.status(500).json({ error: 'Failed to save settings to Blob storage' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Settings API error:', error);

    if (req.method === 'GET') {
      return res.status(200).json({ ...defaultSettings, _source: 'error-fallback' });
    }

    return res.status(500).json({
      error: 'Failed to process settings request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
