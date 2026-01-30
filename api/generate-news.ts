import type { VercelRequest, VercelResponse } from '@vercel/node';

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
  try {
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
    const { deals, teamStats } = req.body as {
      deals: DealInfo[];
      teamStats?: { totalThisMonth: number; goalPercentage: number };
    };

    if (!deals || deals.length === 0) {
      return res.status(200).json({ news: [] });
    }

    // Dynamic import to avoid module loading issues
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
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

    const prompt = `You're the witty office comedian writing the sales team's internal news feed. Make it ACTUALLY funny - the kind of stuff that makes people chuckle at their desk. Think "The Office" meets sports commentary.

VIBE CHECK - Be:
- Genuinely funny, not corporate-cringe funny
- Relatable to anyone who's worked in sales/office life
- Playfully roasting (with love) - tease the rep like a friend would
- Self-aware and a little sarcastic when appropriate
- Office-appropriate but not boring

STYLE IDEAS:
- Mock dramatic sports commentary ("AND THE CROWD GOES MILD!")
- Fake breaking news alerts for mundane wins
- Overly specific observations ("closing deals while their coffee gets cold")
- Gentle roasts ("finally remembered how to use the CRM")
- Relatable office humor ("powered by sheer spite and caffeine")
- Pop culture references that actually land
- Fake movie titles for deals ("Fast & Furious: Contract Drift")

RULES:
- Headlines: Under 50 chars, punchy and quotable
- Body: Under 80 chars, the funny punchline or detail
- First names only
- Varied emojis that match the energy
- NO generic phrases like "crushing it" or "killing the game"
- Make each one feel different - vary the humor style

Recent Deals:
${dealsText}
${teamStatsText}

JSON format:
[
  {
    "dealIndex": 0,
    "emoji": "emoji",
    "headline": "Punchy headline",
    "body": "Funny body text"
  }
]

Generate one article per deal (plus team stats if provided). Make them actually laugh.`;

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
    // Return empty news on any error so UI doesn't break
    return res.status(200).json({
      news: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
