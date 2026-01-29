import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONDAY_API_URL = 'https://api.monday.com/v2';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiToken = process.env.MONDAY_API_TOKEN;

  if (!apiToken) {
    return res.status(500).json({ error: 'Monday API token not configured' });
  }

  try {
    // Fetch all users
    const usersQuery = `
      query {
        users (limit: 100) {
          id
          name
          photo_thumb
          email
        }
      }
    `;

    const usersResponse = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: usersQuery })
    });

    const usersData = await usersResponse.json();
    const users = usersData.data?.users || [];

    // Create a simple map for quick lookup
    const userMap = new Map<string, { name: string; photo_thumb: string | null }>();
    for (const user of users) {
      userMap.set(String(user.id), { name: user.name, photo_thumb: user.photo_thumb });
    }

    // Now fetch some items to see the deal_owner column values
    const itemsQuery = `
      query {
        boards(ids: [6385549292]) {
          items_page(limit: 20) {
            items {
              name
              column_values(ids: ["deal_owner"]) {
                id
                text
                value
              }
            }
          }
        }
      }
    `;

    const itemsResponse = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiToken,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: itemsQuery })
    });

    const itemsData = await itemsResponse.json();
    const items = itemsData.data?.boards?.[0]?.items_page?.items || [];

    // Parse the owner info and try to match
    const ownerInfo = items.map((item: any) => {
      const ownerCol = item.column_values.find((c: any) => c.id === 'deal_owner');
      let parsedValue = null;
      let matchedUser = null;

      if (ownerCol?.value) {
        try {
          parsedValue = JSON.parse(ownerCol.value);
          if (parsedValue.personsAndTeams && parsedValue.personsAndTeams.length > 0) {
            const person = parsedValue.personsAndTeams[0];
            if (person.id) {
              matchedUser = userMap.get(String(person.id));
            }
          }
        } catch (e) {
          parsedValue = { error: 'Parse error' };
        }
      }

      return {
        itemName: item.name,
        ownerText: ownerCol?.text,
        parsedValue,
        matchedUser
      };
    });

    // Find Matt Rhoades and Josh specifically
    const mattDeals = ownerInfo.filter((o: any) => o.ownerText?.includes('Matt'));
    const joshDeals = ownerInfo.filter((o: any) => o.ownerText?.includes('Josh'));

    return res.status(200).json({
      totalUsers: users.length,
      usersWithPhotos: users.filter((u: any) => u.photo_thumb).map((u: any) => ({ id: u.id, name: u.name, hasPhoto: true })),
      usersWithoutPhotos: users.filter((u: any) => !u.photo_thumb).map((u: any) => ({ id: u.id, name: u.name, hasPhoto: false })),
      sampleOwnerInfo: ownerInfo.slice(0, 5),
      mattDeals,
      joshDeals
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to fetch debug data',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
