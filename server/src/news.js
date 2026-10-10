// F1 news headlines from public RSS feeds (Formula1.com, Autosport, Motorsport.com,
// The Race). Only the headline, a short summary, the picture and a link are shown;
// articles open on the publisher's site. Cached for 15 minutes.
import { cached, fetchText, MINUTE } from './http.js';

const FEEDS = (process.env.NEWS_FEEDS
  ? process.env.NEWS_FEEDS.split(',').map((u) => ({ url: u.trim(), source: new URL(u.trim()).hostname.replace(/^www\./, '') }))
  : [
      { url: 'https://www.formula1.com/en/latest/all.xml', source: 'Formula1.com' },
      { url: 'https://www.autosport.com/rss/f1/news/', source: 'Autosport' },
      { url: 'https://www.motorsport.com/rss/f1/news/', source: 'Motorsport.com' },
      { url: 'https://www.the-race.com/formula-1/feed/', source: 'The Race' },
    ]
).filter((f) => f.url);

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, e) => ENTITIES[e]);
const stripTags = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? null;
const attr = (xml, name, a) => xml.match(new RegExp(`<${name}\\s[^>]*${a}="([^"]+)"`, 'i'))?.[1] ?? null;
const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null);

// Parses RSS 2.0 items (and Atom entries) into plain headlines.
export function parseFeed(xml, source) {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  return items
    .map((item) => {
      const link = safeUrl(decode(tag(item, 'link') ?? '').trim()) ?? safeUrl(attr(item, 'link', 'href'));
      const image = safeUrl(attr(item, 'enclosure', 'url') ?? attr(item, 'media:content', 'url') ?? attr(item, 'media:thumbnail', 'url') ?? decode(tag(item, 'description') ?? '').match(/<img[^>]+src="([^"]+)"/i)?.[1]);
      const date = Date.parse(stripTags(tag(item, 'pubDate') ?? tag(item, 'published') ?? tag(item, 'updated') ?? ''));
      return {
        title: stripTags(tag(item, 'title') ?? ''),
        summary: stripTags(tag(item, 'description') ?? tag(item, 'summary') ?? '').slice(0, 280),
        link,
        image,
        source,
        publishedAt: isNaN(date) ? null : new Date(date).toISOString(),
      };
    })
    .filter((x) => x.title && x.link);
}

export function getNews() {
  return cached('news', 15 * MINUTE, async () => {
    const lists = await Promise.allSettled(FEEDS.map(async (f) => parseFeed(await fetchText(f.url, { timeoutMs: 10_000, headers: { 'User-Agent': 'F1Live/1.0 (+news reader)' } }), f.source)));
    const seen = new Set();
    const all = lists
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((x) => {
        const key = x.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Date.parse(b.publishedAt ?? 0) - Date.parse(a.publishedAt ?? 0));
    if (!all.length && lists.every((r) => r.status === 'rejected')) throw new Error('News feeds are unavailable');
    return all.slice(0, 120);
  });
}

// Headlines mentioning any of the words (team or driver names).
export async function searchNews(query) {
  const words = String(query ?? '').toLowerCase().split(',').map((w) => w.trim()).filter((w) => w.length >= 3).slice(0, 6);
  const news = await getNews();
  if (!words.length) return news;
  return news.filter((n) => words.some((w) => `${n.title} ${n.summary}`.toLowerCase().includes(w)));
}
