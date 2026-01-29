import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const DEALS_BOARD_ID = '6385549292';
// Note: We query ALL deals on the board, not just a specific group
// A deal is considered "won" if it has a Date Signed (date4__1) populated
// Build trigger: v3

interface MondayItem {
  id: string;
  name: string;
  column_values: Array<{
    id: string;
    text: string | null;
    value: string | null;
  }>;
}

interface DashboardData {
  salesReps: Array<{
    repId: string;
    name: string;
    initials: string;
    color: string;
    currentMonth: number;
    currentMonthCW: number;
    currentMonthAE: number;
    lastMonth: number;
  }>;
  topDeals: {
    thisWeek: {
      company: string;
      value: number;
      rep: { name: string; initials: string; color: string };
    } | null;
    lastWeek: {
      company: string;
      value: number;
      rep: { name: string; initials: string; color: string };
    } | null;
  };
  cwTarget: { current: number; goal: number; label: string };
  aeTarget: { current: number; goal: number; label: string };
  news: Array<{
    id: number;
    type: string;
    emoji: string;
    headline: string;
    body: string;
    timestamp: string;
    rep: { name: string; initials: string; color: string } | null;
  }>;
}

// Color palette for sales reps
const REP_COLORS = [
  '#8B5CF6', '#14B8A6', '#F472B6', '#F59E0B',
  '#3B82F6', '#EC4899', '#06B6D4', '#84CC16',
  '#EF4444', '#6366F1', '#10B981', '#F97316'
];

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRepColor(index: number): string {
  return REP_COLORS[index % REP_COLORS.length];
}

function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

function isCurrentMonth(date: Date): boolean {
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

function isLastMonth(date: Date): boolean {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear();
}

function isThisWeek(date: Date): boolean {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return date >= startOfWeek;
}

function isLastWeek(date: Date): boolean {
  const now = new Date();
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setDate(now.getDate() - now.getDay());
  startOfThisWeek.setHours(0, 0, 0, 0);

  const startOfLastWeek = new Date(startOfThisWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  return date >= startOfLastWeek && date < startOfThisWeek;
}

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

async function fetchBoardColumns(apiToken: string): Promise<Array<{id: string, title: string, type: string}>> {
  const query = `
    query {
      boards(ids: [${DEALS_BOARD_ID}]) {
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiToken,
      'API-Version': '2024-10'
    },
    body: JSON.stringify({ query })
  });

  const data = await response.json();
  return data.data?.boards?.[0]?.columns || [];
}

async function fetchMondayData(apiToken: string): Promise<MondayItem[]> {
  // Fetch items with pagination - a deal is "won" if Date Signed is populated
  const allItems: MondayItem[] = [];
  let cursor: string | null = null;

  do {
    // Query ALL column values to see what's available
    const query = `
      query ($cursor: String) {
        boards(ids: [${DEALS_BOARD_ID}]) {
          items_page(limit: 500, cursor: $cursor) {
            cursor
            items {
              id
              name
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

    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({
        query,
        variables: { cursor }
      })
    });

    if (!response.ok) {
      throw new Error(`Monday API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      throw new Error(`Monday GraphQL error: ${JSON.stringify(data.errors)}`);
    }

    const itemsPage = data.data?.boards?.[0]?.items_page;
    const items = itemsPage?.items || [];

    // Filter to only items where Date Signed (date4__1) is populated
    const signedItems = items.filter((item: MondayItem) => {
      const dateSignedCol = item.column_values.find(c => c.id === 'date4__1');
      return dateSignedCol?.text && dateSignedCol.text.trim() !== '';
    });

    allItems.push(...signedItems);
    cursor = itemsPage?.cursor || null;

    // Safety limit - stop after fetching too many pages
    if (allItems.length > 5000) break;

  } while (cursor);

  return allItems;
}

function processData(items: MondayItem[], monthlyGoal: number, topDealsMinThreshold: number = 0): DashboardData {
  const repMap = new Map<string, {
    name: string;
    currentMonth: number;
    currentMonthCW: number;
    currentMonthAE: number;
    lastMonth: number;
    deals: Array<{ company: string; value: number; dateSigned: Date }>;
  }>();

  let cwSourcedCurrentMonth = 0;
  let aeSourcedCurrentMonth = 0;

  const recentDeals: Array<{
    company: string;
    value: number;
    repName: string;
    dateSigned: Date;
    isThisWeek: boolean;
    isLastWeek: boolean;
  }> = [];

  for (const item of items) {
    const ownerCol = item.column_values.find(c => c.id === 'deal_owner');
    const valueCol = item.column_values.find(c => c.id === 'deal_value');
    const dateSignedCol = item.column_values.find(c => c.id === 'date4__1');
    const leadSourceCol = item.column_values.find(c => c.id === 'color_mm01fk8y');
    const companyCol = item.column_values.find(c => c.id === 'connect_boards5__1');
    const scopeCol = item.column_values.find(c => c.id === 'link_to___scopes____1');

    const repName = ownerCol?.text || 'Unknown';
    const dealValue = parseFloat(valueCol?.text || '0') || 0;
    const dateSignedStr = dateSignedCol?.text ?? null;
    const dateSigned = parseDate(dateSignedStr);
    const leadSourceType = leadSourceCol?.text || '';

    // Extract company name from item name (format: "Company Name\n [Type]\n [ID]")
    const companyName = item.name.split('\n')[0].trim();

    if (!dateSigned) continue;

    // Update rep totals
    if (!repMap.has(repName)) {
      repMap.set(repName, { name: repName, currentMonth: 0, currentMonthCW: 0, currentMonthAE: 0, lastMonth: 0, deals: [] });
    }
    const rep = repMap.get(repName)!;

    if (isCurrentMonth(dateSigned)) {
      rep.currentMonth += dealValue;

      // Categorize by lead source type - default to CW Sourced unless explicitly AE Sourced
      if (leadSourceType === 'AE Sourced') {
        aeSourcedCurrentMonth += dealValue;
        rep.currentMonthAE += dealValue;
      } else {
        cwSourcedCurrentMonth += dealValue;
        rep.currentMonthCW += dealValue;
      }
    } else if (isLastMonth(dateSigned)) {
      rep.lastMonth += dealValue;
    }

    rep.deals.push({ company: companyName, value: dealValue, dateSigned });

    // Track recent deals for top deals widget
    // Only include deals that have scopes attached AND meet minimum threshold
    const hasScope = scopeCol?.text && scopeCol.text.trim() !== '';
    const meetsThreshold = dealValue >= topDealsMinThreshold;

    if ((isThisWeek(dateSigned) || isLastWeek(dateSigned)) && hasScope && meetsThreshold) {
      recentDeals.push({
        company: companyName,
        value: dealValue,
        repName,
        dateSigned,
        isThisWeek: isThisWeek(dateSigned),
        isLastWeek: isLastWeek(dateSigned)
      });
    }
  }

  // Convert rep map to sorted array
  const reps = Array.from(repMap.values());
  let repColorIndex = 0;
  const salesReps = reps
    .filter(rep => rep.currentMonth > 0 || rep.lastMonth > 0)
    .sort((a, b) => b.currentMonth - a.currentMonth)
    .slice(0, 10)
    .map(rep => ({
      repId: rep.name.replace(/\s+/g, '_').toLowerCase(),
      name: rep.name,
      initials: getInitials(rep.name),
      color: getRepColor(repColorIndex++),
      currentMonth: Math.round(rep.currentMonth),
      currentMonthCW: Math.round(rep.currentMonthCW),
      currentMonthAE: Math.round(rep.currentMonthAE),
      lastMonth: Math.round(rep.lastMonth)
    }));

  // Find top deals this week and last week
  const thisWeekDeals = recentDeals.filter(d => d.isThisWeek).sort((a, b) => b.value - a.value);
  const lastWeekDeals = recentDeals.filter(d => d.isLastWeek).sort((a, b) => b.value - a.value);

  const getRepInfo = (repName: string) => {
    const rep = salesReps.find(r => r.name === repName);
    return rep
      ? { name: rep.name, initials: rep.initials, color: rep.color }
      : { name: repName, initials: getInitials(repName), color: '#6B7280' };
  };

  const topDeals = {
    thisWeek: thisWeekDeals[0] ? {
      company: thisWeekDeals[0].company,
      value: Math.round(thisWeekDeals[0].value),
      rep: getRepInfo(thisWeekDeals[0].repName)
    } : null,
    lastWeek: lastWeekDeals[0] ? {
      company: lastWeekDeals[0].company,
      value: Math.round(lastWeekDeals[0].value),
      rep: getRepInfo(lastWeekDeals[0].repName)
    } : null
  };

  // Generate news from recent deals
  const news = recentDeals
    .sort((a, b) => b.dateSigned.getTime() - a.dateSigned.getTime())
    .slice(0, 8)
    .map((deal, index) => ({
      id: index + 1,
      type: 'win' as const,
      emoji: deal.value >= 10000 ? '🔥' : '🎉',
      headline: `${deal.repName.split(' ')[0]} closes ${deal.company} for $${deal.value.toLocaleString()}!`,
      body: deal.value >= 10000 ? 'Big deal alert!' : 'Another one in the books.',
      timestamp: formatTimestamp(deal.dateSigned),
      rep: getRepInfo(deal.repName)
    }));

  // Add team stats if we have enough data
  const totalCurrentMonth = salesReps.reduce((sum, rep) => sum + rep.currentMonth, 0);
  const goalPercentage = Math.round((totalCurrentMonth / monthlyGoal) * 100);

  if (goalPercentage > 100) {
    news.unshift({
      id: 0,
      type: 'win' as const,
      emoji: '📊',
      headline: `Team hits ${goalPercentage}% of monthly goal!`,
      body: `$${totalCurrentMonth.toLocaleString()} closed this month.`,
      timestamp: 'Today',
      rep: { name: 'Team', initials: '🎯', color: '#8B5CF6' }
    });
  }

  return {
    salesReps,
    topDeals,
    cwTarget: {
      current: Math.round(cwSourcedCurrentMonth),
      goal: monthlyGoal,
      label: 'CW Sourced Target'
    },
    aeTarget: {
      current: Math.round(aeSourcedCurrentMonth),
      goal: monthlyGoal,
      label: 'AE Sourced Target'
    },
    news: news.slice(0, 6)
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiToken = process.env.MONDAY_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({ error: 'Monday API token not configured' });
  }

  try {
    const monthlyGoal = parseInt(process.env.MONTHLY_GOAL || '100000', 10);
    // Get threshold from query parameter (sent from client settings)
    const topDealsMinThreshold = parseInt(req.query.minThreshold as string || '0', 10);

    // Fetch board columns to find correct column IDs
    const columns = await fetchBoardColumns(apiToken);

    const items = await fetchMondayData(apiToken);
    const data = processData(items, monthlyGoal, topDealsMinThreshold);

    // Cache for 5 minutes
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

    // Add debug info - check for scope column
    const itemsWithScope = items.filter(item => {
      const scopeCol = item.column_values.find(c => c.id === 'link_to___scopes____1');
      return scopeCol?.text && scopeCol.text.trim() !== '';
    });

    // Find recent items (this week or last week) with scopes
    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setDate(now.getDate() - now.getDay());
    startOfThisWeek.setHours(0, 0, 0, 0);
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

    const recentItemsWithScope = items.filter(item => {
      const dateSignedCol = item.column_values.find(c => c.id === 'date4__1');
      const scopeCol = item.column_values.find(c => c.id === 'link_to___scopes____1');
      const valueCol = item.column_values.find(c => c.id === 'deal_value');
      const dateSigned = parseDate(dateSignedCol?.text ?? null);
      const hasScope = scopeCol?.text && scopeCol.text.trim() !== '';
      const dealValue = parseFloat(valueCol?.text || '0') || 0;

      if (!dateSigned) return false;
      const isRecent = dateSigned >= startOfLastWeek;
      return isRecent && hasScope && dealValue >= topDealsMinThreshold;
    });

    // Find all unique lead source values
    const leadSourceValues = new Set<string>();
    items.forEach(item => {
      const leadSourceCol = item.column_values.find(c => c.id === 'color_mm01fk8y');
      if (leadSourceCol?.text) leadSourceValues.add(leadSourceCol.text);
    });

    // Find recent items (for top deals debugging)
    const recentItems = items.filter(item => {
      const dateSignedCol = item.column_values.find(c => c.id === 'date4__1');
      const dateSigned = parseDate(dateSignedCol?.text ?? null);
      if (!dateSigned) return false;
      return dateSigned >= startOfLastWeek;
    });

    return res.status(200).json({
      ...data,
      _debug: {
        totalItemsWithDateSigned: items.length,
        itemsWithScope: itemsWithScope.length,
        topDealsMinThreshold,
        recentItemsCount: recentItems.length,
        recentItemsWithScopeCount: recentItemsWithScope.length,
        leadSourceValuesFound: Array.from(leadSourceValues),
        recentItemsSample: recentItems.slice(0, 3).map(item => ({
          name: item.name,
          scope: item.column_values.find(c => c.id === 'link_to___scopes____1')?.text,
          value: item.column_values.find(c => c.id === 'deal_value')?.text,
          dateSigned: item.column_values.find(c => c.id === 'date4__1')?.text,
          leadSource: item.column_values.find(c => c.id === 'color_mm01fk8y')?.text
        })),
        sampleItem: items[0] ? {
          name: items[0].name,
          columns: items[0].column_values.map(c => ({ id: c.id, text: c.text, value: c.value }))
        } : null,
        // Check scope column value field (it's a board_relation)
        scopeColumnSample: items.slice(0, 10).map(item => {
          const scopeCol = item.column_values.find(c => c.id === 'link_to___scopes____1');
          return {
            name: item.name.split('\n')[0],
            scopeText: scopeCol?.text,
            scopeValue: scopeCol?.value
          };
        }),
        boardColumns: columns.filter(c =>
          c.title.toLowerCase().includes('scope') ||
          c.title.toLowerCase().includes('source') ||
          c.title.toLowerCase().includes('ae') ||
          c.title.toLowerCase().includes('cw') ||
          c.type === 'board_relation'
        )
      }
    });
  } catch (error) {
    console.error('Error fetching Monday data:', error);
    return res.status(500).json({
      error: 'Failed to fetch dashboard data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
