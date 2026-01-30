import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const DEALS_BOARD_ID = '6385549292';
const STORAGE_KEY = 'dashboard_settings';

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

// GET settings from Monday board storage
async function getSettings(apiToken: string): Promise<DashboardSettings> {
  const query = `
    query {
      boards(ids: [${DEALS_BOARD_ID}]) {
        id
      }
    }
  `;

  // First verify board access
  const verifyResponse = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiToken,
      'API-Version': '2024-10'
    },
    body: JSON.stringify({ query })
  });

  if (!verifyResponse.ok) {
    throw new Error('Failed to verify board access');
  }

  // Use Monday's storage API to get settings
  // Note: Monday's storage API is accessed via the SDK in apps,
  // but for API access we use board columns or a dedicated item
  // For simplicity, we'll store settings in a special "settings" item on the board
  // or use the board's description field

  // Alternative approach: Use a dedicated settings item on the board
  // Look for an item named "_DASHBOARD_SETTINGS_"
  const settingsQuery = `
    query {
      boards(ids: [${DEALS_BOARD_ID}]) {
        items_page(limit: 1, query_params: {rules: [{column_id: "name", compare_value: ["_DASHBOARD_SETTINGS_"]}]}) {
          items {
            id
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: settingsQuery })
    });

    if (!response.ok) {
      console.error('Failed to fetch settings from Monday');
      return defaultSettings;
    }

    const data = await response.json();
    const items = data.data?.boards?.[0]?.items_page?.items || [];

    if (items.length > 0) {
      // Look for a long_text or text column containing our JSON settings
      const settingsCol = items[0].column_values?.find((c: any) =>
        c.id === 'long_text' || c.id === 'text' || c.id === 'settings_json'
      );

      if (settingsCol?.text) {
        try {
          const parsed = JSON.parse(settingsCol.text);
          return { ...defaultSettings, ...parsed };
        } catch {
          console.error('Failed to parse settings JSON');
        }
      }
    }

    return defaultSettings;
  } catch (error) {
    console.error('Error fetching settings:', error);
    return defaultSettings;
  }
}

// SET settings to Monday board storage
async function saveSettings(apiToken: string, settings: DashboardSettings): Promise<boolean> {
  const settingsJson = JSON.stringify(settings);

  // First, check if settings item exists
  const findQuery = `
    query {
      boards(ids: [${DEALS_BOARD_ID}]) {
        items_page(limit: 1, query_params: {rules: [{column_id: "name", compare_value: ["_DASHBOARD_SETTINGS_"]}]}) {
          items {
            id
          }
        }
      }
    }
  `;

  try {
    const findResponse = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: findQuery })
    });

    const findData = await findResponse.json();
    const existingItems = findData.data?.boards?.[0]?.items_page?.items || [];

    if (existingItems.length > 0) {
      // Update existing item
      const itemId = existingItems[0].id;
      const updateMutation = `
        mutation {
          change_column_value(
            board_id: ${DEALS_BOARD_ID},
            item_id: ${itemId},
            column_id: "long_text",
            value: ${JSON.stringify(JSON.stringify({ text: settingsJson }))}
          ) {
            id
          }
        }
      `;

      const updateResponse = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiToken,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: updateMutation })
      });

      return updateResponse.ok;
    } else {
      // Create new settings item
      // Note: This requires a group ID - we'll use the first group
      const groupQuery = `
        query {
          boards(ids: [${DEALS_BOARD_ID}]) {
            groups {
              id
            }
          }
        }
      `;

      const groupResponse = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiToken,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: groupQuery })
      });

      const groupData = await groupResponse.json();
      const groups = groupData.data?.boards?.[0]?.groups || [];

      if (groups.length === 0) {
        console.error('No groups found on board');
        return false;
      }

      const groupId = groups[0].id;

      const createMutation = `
        mutation {
          create_item(
            board_id: ${DEALS_BOARD_ID},
            group_id: "${groupId}",
            item_name: "_DASHBOARD_SETTINGS_",
            column_values: ${JSON.stringify(JSON.stringify({ long_text: { text: settingsJson } }))}
          ) {
            id
          }
        }
      `;

      const createResponse = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiToken,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: createMutation })
      });

      return createResponse.ok;
    }
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const apiToken = process.env.MONDAY_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({ error: 'Monday API token not configured' });
  }

  try {
    if (req.method === 'GET') {
      const settings = await getSettings(apiToken);
      return res.status(200).json(settings);
    }

    if (req.method === 'POST') {
      const settings = req.body as Partial<DashboardSettings>;
      const mergedSettings = { ...defaultSettings, ...settings };
      const success = await saveSettings(apiToken, mergedSettings);

      if (success) {
        return res.status(200).json({ success: true, settings: mergedSettings });
      } else {
        return res.status(500).json({ error: 'Failed to save settings' });
      }
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Settings API error:', error);
    return res.status(500).json({
      error: 'Failed to process settings request',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
