import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Storage } from '@mondaycom/apps-sdk';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get token from Authorization header (short-lived token from Monday iframe)
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    // No token - return defaults (client will use localStorage)
    if (req.method === 'GET') {
      return res.status(200).json({ ...defaultSettings, _source: 'defaults' });
    }
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  try {
    // Initialize Monday Storage with the short-lived token
    const storage = new Storage(token);

    if (req.method === 'GET') {
      // Get settings from Monday Storage
      const result = await storage.get(SETTINGS_KEY, { shared: true });

      if (result.success && result.value) {
        const settings = typeof result.value === 'string'
          ? JSON.parse(result.value)
          : result.value;
        return res.status(200).json({ ...defaultSettings, ...settings, _source: 'monday' });
      }

      // No settings stored yet - return defaults
      return res.status(200).json({ ...defaultSettings, _source: 'defaults' });
    }

    if (req.method === 'POST') {
      // Save settings to Monday Storage
      const newSettings = req.body as Partial<DashboardSettings>;
      const mergedSettings = { ...defaultSettings, ...newSettings };

      // Remove internal fields before storing
      const { _source, ...settingsToStore } = mergedSettings as any;

      const result = await storage.set(SETTINGS_KEY, JSON.stringify(settingsToStore), {
        shared: true  // Accessible from both frontend and backend
      });

      if (result.success) {
        return res.status(200).json({ success: true, settings: settingsToStore });
      } else {
        console.error('Monday Storage set failed:', result.error);
        return res.status(500).json({ error: 'Failed to save to Monday Storage', details: result.error });
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
