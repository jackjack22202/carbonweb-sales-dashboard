import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

interface DealInfo {
  repName: string;
  company: string;
  value: number;
  timestamp: string;
}

interface NewsArticle {
  id: number;
  type: string;
  emoji: string;
  headline: string;
  body: string;
  timestamp: string;
  rep: {
    name: string;
    initials: string;
    color: string;
    photoUrl: string | null;
  } | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!anthropicKey) {
    console.error('ANTHROPIC_API_KEY not configured - returning empty news');
    // Return empty news instead of error so UI doesn't break
    return res.status(200).json({ news: [] });
  }

  try {
    const { deals, teamStats } = req.body as {
      deals: DealInfo[];
      teamStats?: { totalThisMonth: number; goalPercentage: number };
    };

    if (!deals || deals.length === 0) {
      return res.status(200).json({ news: [] });
    }

    const client = new Anthropic({
      apiKey: anthropicKey,
    });

    // Build the prompt for Claude
    const dealsText = deals.map((d, i) =>
      `${i + 1}. ${d.repName} closed "${d.company}" for $${d.value.toLocaleString()} (${d.timestamp})`
    ).join('\n');

    const teamStatsText = teamStats
      ? `\nTeam Achievement: The team has closed $${teamStats.totalThisMonth.toLocaleString()} this month (${teamStats.goalPercentage}% of goal).`
      : '';

    const prompt = `You are a fun, energetic sports-style announcer for a sales team dashboard. Generate creative, funny, and engaging news headlines and short bodies for these recent sales wins. Make them feel like exciting sports commentary or fun office announcements.

Rules:
- Keep headlines under 60 characters
- Keep body text under 100 characters
- Use varied emojis that match the energy (fire for big deals, party for wins, etc.)
- Include playful references to sports, movies, or pop culture when appropriate
- Vary the tone - some can be dramatic, some funny, some celebratory
- First names only for reps
- Include puns or wordplay when it fits naturally

Recent Deals:
${dealsText}
${teamStatsText}

Respond with a JSON array of news articles in this exact format:
[
  {
    "dealIndex": 0,
    "emoji": "emoji here",
    "headline": "Short punchy headline",
    "body": "Fun descriptive body text"
  }
]

Generate one article per deal, plus one for team stats if provided.`;

    const message = await client.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    // Parse the response
    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // Extract JSON from response (it might have markdown formatting)
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Failed to parse Claude response:', responseText);
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    const generatedArticles = JSON.parse(jsonMatch[0]);

    // Map back to full news articles
    const news: NewsArticle[] = generatedArticles.map((article: any, index: number) => {
      const dealIndex = article.dealIndex ?? index;
      const deal = deals[dealIndex];

      // Handle team stats article (no deal reference)
      if (!deal && teamStats) {
        return {
          id: index,
          type: 'stats',
          emoji: article.emoji || '📊',
          headline: article.headline,
          body: article.body,
          timestamp: 'Today',
          rep: { name: 'Team', initials: '🎯', color: '#8B5CF6', photoUrl: null }
        };
      }

      if (!deal) return null;

      return {
        id: index,
        type: 'win',
        emoji: article.emoji || (deal.value >= 10000 ? '🔥' : '🎉'),
        headline: article.headline,
        body: article.body,
        timestamp: deal.timestamp,
        rep: {
          name: deal.repName,
          initials: deal.repName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2),
          color: '#8B5CF6',
          photoUrl: null
        }
      };
    }).filter(Boolean);

    // Cache for 10 minutes
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');

    return res.status(200).json({ news });
  } catch (error) {
    console.error('Error generating news:', error);
    return res.status(500).json({
      error: 'Failed to generate news',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
