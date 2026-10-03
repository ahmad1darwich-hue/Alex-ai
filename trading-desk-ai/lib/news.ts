import type { NewsItem } from "./types";

/**
 * Live news headlines via Google News RSS — public, no key.
 * We only read titles and links; we never scrape article bodies here.
 */
export async function fetchNews(query: string, limit = 6): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TradingDeskAI/0.1)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml).slice(0, limit);
  } catch {
    // News is context, not a hard dependency. An empty list is a valid answer.
    return [];
  }
}

function parseRss(xml: string): NewsItem[] {
  const items: NewsItem[] = [];
  const blocks = xml.split("<item>").slice(1);
  for (const block of blocks) {
    const title = extract(block, "title");
    const link = extract(block, "link");
    const pub = extract(block, "pubDate");
    const source = extract(block, "source");
    if (!title || !link) continue;
    items.push({
      title: decodeEntities(title),
      url: link.trim(),
      source: source ? decodeEntities(source) : "Google News",
      publishedAt: pub ? new Date(pub).toISOString() : null,
    });
  }
  return items;
}

function extract(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}
