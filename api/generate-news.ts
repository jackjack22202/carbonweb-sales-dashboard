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

    const prompt = `You're writing a sales team's news feed. Your job: make coworkers genuinely laugh out loud. Not polite chuckles - real laughs.

COMEDIC TECHNIQUES TO USE (pick different ones for each article):
1. ABSURD SPECIFICITY - "closed the deal at exactly 4:47pm, missing happy hour by 13 minutes"
2. FAKE DRAMA - "BREAKING: Local sales rep discovers 'follow up' button, scientists baffled"
3. UNDERSTATEMENT - "casually closes 6-figure deal, returns to arguing about lunch orders"
4. MOCK FORMALITY - "The committee has voted: this deal officially slaps"
5. POP CULTURE PARODY - movie/TV/meme references ("I am once again asking for your signed contract")
6. RELATABLE CHAOS - "closed deal while on mute asking 'can you hear me now?'"
7. PETTY OBSERVATIONS - "finally beats their Q4 2023 number, only took 14 months"
8. SPORTS BROADCASTER - "AND THAT'S GONNA DO IT! What a play! The crowd of 3 Slack reacts goes WILD"
9. CONSPIRACY THEORIES - "sources say they may have actually read the prospect's LinkedIn"
10. HUMBLE BRAG CALLOUT - "tries to act casual about it, fails immediately"

BANNED FOREVER (instant cringe):
- "crushing it" / "killing it" / "slaying"
- "coffee" references (overdone)
- "Monday motivation" energy
- Generic celebration ("way to go!" "nice work!")
- Anything a LinkedIn influencer would post

REQUIREMENTS:
- Headlines: Under 50 chars, would work as a tweet
- Body: Under 80 chars, the punchline that lands
- First names only (not full names)
- EVERY article must use a DIFFERENT comedic technique from the list above
- Emojis should be unexpected/funny, not just 🎉🔥

Recent Deals:
${dealsText}
${teamStatsText}

Return ONLY valid JSON array:
[
  {
    "dealIndex": 0,
    "emoji": "emoji",
    "headline": "Punchy headline",
    "body": "Funny body text"
  }
]

Generate one article per deal. Make each one a different style of funny.`;

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
