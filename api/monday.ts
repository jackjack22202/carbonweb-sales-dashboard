import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const DEALS_BOARD_ID = '6385549292';
// Note: We query ALL deals on the board, not just a specific group
// A deal is considered "won" if it has a Date Signed (date4__1) populated

// In-memory cache to avoid hitting Monday API on every request
interface CacheEntry {
  data: DashboardData;
  timestamp: number;
}
let dataCache: CacheEntry | null = null;
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

interface MondayItem {
  id: string;
  name: string;
  column_values: Array<{
    id: string;
    text: string | null;
    value: string | null;
  }>;
}

interface RepInfo {
  name: string;
  initials: string;
  color: string;
  photoUrl: string | null;
}

interface SEInfo {
  name: string;
  initials: string;
  color: string;
  photoUrl: string | null;
}

interface DashboardData {
  salesReps: Array<{
    repId: string;
    name: string;
    initials: string;
    color: string;
    photoUrl: string | null;
    currentMonth: number;
    currentMonthCW: number;
    currentMonthAE: number;
    lastMonth: number;
  }>;
  topDeals: {
    thisWeek: {
      company: string;
      value: number;
      rep: RepInfo;
      se: SEInfo | null;
      scopeId: string | null;
    } | null;
    lastWeek: {
      company: string;
      value: number;
      rep: RepInfo;
      se: SEInfo | null;
      scopeId: string | null;
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
    rep: RepInfo | null;
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

interface MondayUser {
  id: string;
  name: string;
  photo_thumb: string | null;
}

// Fetch all users to get their photo URLs (with pagination to get all users)
async function fetchUsers(apiToken: string): Promise<Map<string, MondayUser>> {
  const userMap = new Map<string, MondayUser>();
  let page = 1;
  const maxPages = 10; // Safety limit - 1000 users max

  try {
    while (page <= maxPages) {
      const query = `
        query {
          users (limit: 100, page: ${page}) {
            id
            name
            photo_thumb
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

      if (!response.ok) {
        console.error(`Monday API error fetching users page ${page}: ${response.status}`);
        break;
      }

      const data = await response.json();

      if (data.errors) {
        console.error('Monday GraphQL error fetching users:', data.errors);
        break;
      }

      const users = data.data?.users || [];

      // No more users to fetch
      if (users.length === 0) {
        break;
      }

      // Add users to map using string keys
      for (const user of users) {
        userMap.set(String(user.id), user);
      }

      // If we got fewer than 100, we've reached the end
      if (users.length < 100) {
        break;
      }

      page++;
    }

    console.log(`Loaded ${userMap.size} users from Monday API (${page} pages)`);

    return userMap;
  } catch (error) {
    console.error('Error fetching users:', error);
    return userMap; // Return what we have so far
  }
}

async function fetchMondayData(apiToken: string): Promise<MondayItem[]> {
  // Calculate date range - only need last 2 months
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  twoMonthsAgo.setDate(1);
  const dateFilter = twoMonthsAgo.toISOString().split('T')[0];

  // Use items_page_by_column_values to filter by date - much faster than fetching all
  const query = `
    query {
      boards(ids: [${DEALS_BOARD_ID}]) {
        items_page_by_column_values(
          limit: 500
          columns: [{column_id: "date4__1", column_values: []}]
        ) {
          cursor
          items {
            id
            name
            column_values(ids: ["deal_owner", "deal_value", "date4__1", "color_mm01fk8y", "connect_boards5__1", "link_to___scopes____1"]) {
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
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`Monday API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.errors) {
      // Fall back to regular pagination if column value filter doesn't work
      console.error('Monday query error, falling back to pagination:', data.errors);
      return fetchMondayDataFallback(apiToken);
    }

    const itemsPage = data.data?.boards?.[0]?.items_page_by_column_values;
    const items = itemsPage?.items || [];

    // Filter to items from last 2 months with date signed
    const filteredItems = items.filter((item: MondayItem) => {
      const dateSignedCol = item.column_values.find(c => c.id === 'date4__1');
      if (!dateSignedCol?.text || dateSignedCol.text.trim() === '') return false;
      const dateSigned = new Date(dateSignedCol.text);
      return !isNaN(dateSigned.getTime()) && dateSigned >= twoMonthsAgo;
    });

    return filteredItems;
  } catch (error) {
    console.error('Error in fetchMondayData:', error);
    return fetchMondayDataFallback(apiToken);
  }
}

// Fallback to paginated fetch if column value query fails
async function fetchMondayDataFallback(apiToken: string): Promise<MondayItem[]> {
  const allItems: MondayItem[] = [];
  let cursor: string | null = null;
  let pageCount = 0;
  const maxPages = 5; // Limit to 5 pages (2500 items) to balance data completeness vs timeout

  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  twoMonthsAgo.setDate(1);

  do {
    const query = `
      query ($cursor: String) {
        boards(ids: [${DEALS_BOARD_ID}]) {
          items_page(limit: 500, cursor: $cursor) {
            cursor
            items {
              id
              name
              column_values(ids: ["deal_owner", "deal_value", "date4__1", "color_mm01fk8y", "connect_boards5__1", "link_to___scopes____1"]) {
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
      body: JSON.stringify({ query, variables: { cursor } })
    });

    if (!response.ok) throw new Error(`Monday API error: ${response.status}`);
    const data = await response.json();
    if (data.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);

    const itemsPage = data.data?.boards?.[0]?.items_page;
    const items = itemsPage?.items || [];

    const signedItems = items.filter((item: MondayItem) => {
      const dateSignedCol = item.column_values.find(c => c.id === 'date4__1');
      if (!dateSignedCol?.text) return false;
      const dateSigned = new Date(dateSignedCol.text);
      return !isNaN(dateSigned.getTime()) && dateSigned >= twoMonthsAgo;
    });

    allItems.push(...signedItems);
    cursor = itemsPage?.cursor || null;
    pageCount++;

  } while (cursor && pageCount < maxPages);

  return allItems;
}

// Fetch scope items to get SE (Solutions Engineer) info
// The scope items should have a people column for the SE assigned
async function fetchScopeItems(apiToken: string, scopeIds: number[], userMap: Map<string, MondayUser>): Promise<Map<number, SEInfo>> {
  if (scopeIds.length === 0) return new Map();

  const seMap = new Map<number, SEInfo>();

  try {
    // Query scope items - look for a people column (typically 'person' or similar)
    const query = `
      query {
        items(ids: [${scopeIds.join(',')}]) {
          id
          column_values {
            id
            text
            value
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

    if (!response.ok) {
      console.error('Failed to fetch scope items');
      return seMap;
    }

    const data = await response.json();
    const items = data.data?.items || [];

    for (const item of items) {
      // Find a people column in the scope (could be 'person', 'people', 'se', etc.)
      const peopleCol = item.column_values?.find((c: any) =>
        c.type === 'people' || c.type === 'multiple-person' ||
        c.id === 'person' || c.id === 'people' || c.id === 'se' || c.id === 'solutions_engineer'
      );

      if (peopleCol?.value) {
        try {
          const parsed = JSON.parse(peopleCol.value);
          if (parsed.personsAndTeams && parsed.personsAndTeams.length > 0) {
            const person = parsed.personsAndTeams[0];
            if (person.id && person.kind === 'person') {
              const user = userMap.get(String(person.id));
              const seName = user?.name || peopleCol.text || 'SE';
              seMap.set(parseInt(item.id), {
                name: seName,
                initials: seName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
                color: '#6366F1', // Indigo for SE
                photoUrl: user?.photo_thumb || null
              });
            }
          }
        } catch {
          // Use text fallback
          if (peopleCol.text) {
            seMap.set(parseInt(item.id), {
              name: peopleCol.text,
              initials: peopleCol.text.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
              color: '#6366F1',
              photoUrl: null
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error fetching scope items:', error);
  }

  return seMap;
}

function processData(items: MondayItem[], monthlyGoal: number, topDealsMinThreshold: number, userMap: Map<string, MondayUser>, scopeSEMap: Map<number, SEInfo>): DashboardData {
  const repMap = new Map<string, {
    name: string;
    photoUrl: string | null;
    currentMonth: number;
    currentMonthCW: number;
    currentMonthAE: number;
    lastMonth: number;
    deals: Array<{ company: string; value: number; dateSigned: Date }>;
  }>();

  // Map to store photo URLs by rep name
  const repPhotoMap = new Map<string, string>();

  let cwSourcedCurrentMonth = 0;
  let aeSourcedCurrentMonth = 0;

  const recentDeals: Array<{
    company: string;
    value: number;
    repName: string;
    dateSigned: Date;
    isThisWeek: boolean;
    isLastWeek: boolean;
    scopeIds: number[];
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

    // Extract photo URL from deal_owner by looking up user ID in userMap
    if (ownerCol?.value && !repPhotoMap.has(repName)) {
      try {
        const parsed = JSON.parse(ownerCol.value);
        if (parsed.personsAndTeams && parsed.personsAndTeams.length > 0) {
          const person = parsed.personsAndTeams[0];
          if (person.id && person.kind === 'person') {
            // Convert to string for consistent lookup
            const personIdStr = String(person.id);
            const user = userMap.get(personIdStr);
            if (user?.photo_thumb) {
              repPhotoMap.set(repName, user.photo_thumb);
              console.log(`Found photo for ${repName}: ${user.photo_thumb.substring(0, 50)}...`);
            } else {
              console.log(`No photo found for ${repName} (ID: ${personIdStr}), user exists: ${!!user}, photo_thumb: ${user?.photo_thumb}`);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Extract company name from item name (format: "Company Name\n [Type]\n [ID]")
    const companyName = item.name.split('\n')[0].trim();

    if (!dateSigned) continue;

    // Update rep totals
    if (!repMap.has(repName)) {
      repMap.set(repName, { name: repName, photoUrl: repPhotoMap.get(repName) || null, currentMonth: 0, currentMonthCW: 0, currentMonthAE: 0, lastMonth: 0, deals: [] });
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
    // For board_relation columns, check the value field for linkedPulseIds
    let hasScope = false;
    let scopeIds: number[] = [];
    if (scopeCol?.text && scopeCol.text.trim() !== '') {
      hasScope = true;
    }
    if (scopeCol?.value) {
      try {
        const parsed = JSON.parse(scopeCol.value);
        if (parsed.linkedPulseIds && parsed.linkedPulseIds.length > 0) {
          hasScope = true;
          scopeIds = parsed.linkedPulseIds.map((p: { linkedPulseId: number }) => p.linkedPulseId);
        }
      } catch {
        // Ignore parse errors
      }
    }
    const meetsThreshold = dealValue >= topDealsMinThreshold;

    if ((isThisWeek(dateSigned) || isLastWeek(dateSigned)) && hasScope && meetsThreshold) {
      recentDeals.push({
        company: companyName,
        value: dealValue,
        repName,
        dateSigned,
        isThisWeek: isThisWeek(dateSigned),
        isLastWeek: isLastWeek(dateSigned),
        scopeIds
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
      photoUrl: rep.photoUrl || repPhotoMap.get(rep.name) || null,
      currentMonth: Math.round(rep.currentMonth),
      currentMonthCW: Math.round(rep.currentMonthCW),
      currentMonthAE: Math.round(rep.currentMonthAE),
      lastMonth: Math.round(rep.lastMonth)
    }));

  // Find top deals this week and last week
  const thisWeekDeals = recentDeals.filter(d => d.isThisWeek).sort((a, b) => b.value - a.value);
  const lastWeekDeals = recentDeals.filter(d => d.isLastWeek).sort((a, b) => b.value - a.value);

  const getRepInfo = (repName: string): RepInfo => {
    const rep = salesReps.find(r => r.name === repName);
    return rep
      ? { name: rep.name, initials: rep.initials, color: rep.color, photoUrl: rep.photoUrl }
      : { name: repName, initials: getInitials(repName), color: '#6B7280', photoUrl: repPhotoMap.get(repName) || null };
  };

  // Get SE info for top deals from the first linked scope
  const getSEInfo = (scopeIds: number[]): SEInfo | null => {
    for (const scopeId of scopeIds) {
      const se = scopeSEMap.get(scopeId);
      if (se) return se;
    }
    return null;
  };

  const topDeals = {
    thisWeek: thisWeekDeals[0] ? {
      company: thisWeekDeals[0].company,
      value: Math.round(thisWeekDeals[0].value),
      rep: getRepInfo(thisWeekDeals[0].repName),
      se: getSEInfo(thisWeekDeals[0].scopeIds),
      scopeId: thisWeekDeals[0].scopeIds[0]?.toString() || null
    } : null,
    lastWeek: lastWeekDeals[0] ? {
      company: lastWeekDeals[0].company,
      value: Math.round(lastWeekDeals[0].value),
      rep: getRepInfo(lastWeekDeals[0].repName),
      se: getSEInfo(lastWeekDeals[0].scopeIds),
      scopeId: lastWeekDeals[0].scopeIds[0]?.toString() || null
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
      rep: { name: 'Team', initials: '🎯', color: '#8B5CF6', photoUrl: null }
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

    // Check cache first (only if threshold matches default - cache doesn't vary by threshold)
    const now = Date.now();
    if (dataCache && (now - dataCache.timestamp) < CACHE_TTL && topDealsMinThreshold === 0) {
      res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(dataCache.data);
    }

    // Fetch users and items in parallel for better performance
    const [userMap, items] = await Promise.all([
      fetchUsers(apiToken),
      fetchMondayData(apiToken)
    ]);

    // Collect all scope IDs from recent deals to fetch SE info
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    const allScopeIds: number[] = [];
    for (const item of items) {
      const scopeCol = item.column_values.find(c => c.id === 'link_to___scopes____1');
      const dateSignedCol = item.column_values.find(c => c.id === 'date4__1');
      const dateSigned = dateSignedCol?.text ? new Date(dateSignedCol.text) : null;

      if (dateSigned && dateSigned >= twoWeeksAgo && scopeCol?.value) {
        try {
          const parsed = JSON.parse(scopeCol.value);
          if (parsed.linkedPulseIds) {
            for (const p of parsed.linkedPulseIds) {
              if (p.linkedPulseId && !allScopeIds.includes(p.linkedPulseId)) {
                allScopeIds.push(p.linkedPulseId);
              }
            }
          }
        } catch { /* ignore */ }
      }
    }

    // Fetch SE info for scopes (limit to first 10 to avoid timeout)
    const scopeSEMap = await fetchScopeItems(apiToken, allScopeIds.slice(0, 10), userMap);

    const data = processData(items, monthlyGoal, topDealsMinThreshold, userMap, scopeSEMap);

    // Update cache (only for default threshold)
    if (topDealsMinThreshold === 0) {
      dataCache = { data, timestamp: now };
    }

    // Cache for 5 minutes on CDN
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
    res.setHeader('X-Cache', 'MISS');

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error fetching Monday data:', error);
    return res.status(500).json({
      error: 'Failed to fetch dashboard data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
