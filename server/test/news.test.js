import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFeed } from '../src/news.js';

test('parses RSS items with pictures, entities and CDATA', () => {
  const xml = `<rss><channel>
    <item><title><![CDATA[Verstappen &amp; Norris clash]]></title><link>https://example.com/a</link>
      <description><![CDATA[<p>Big <b>battle</b> in Austria</p>]]></description>
      <pubDate>Sun, 30 Jun 2024 15:00:00 GMT</pubDate><enclosure url="https://img.example.com/a.jpg" type="image/jpeg"/></item>
    <item><title>No link</title></item>
    <item><title>Bad link</title><link>javascript:alert(1)</link></item>
  </channel></rss>`;
  const items = parseFeed(xml, 'Example');
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    title: 'Verstappen & Norris clash',
    summary: 'Big battle in Austria',
    link: 'https://example.com/a',
    image: 'https://img.example.com/a.jpg',
    source: 'Example',
    publishedAt: '2024-06-30T15:00:00.000Z',
  });
});

test('parses Atom entries', () => {
  const xml = `<feed><entry><title>Hello</title><link href="https://example.com/b"/><updated>2024-07-01T10:00:00Z</updated><summary>Short</summary></entry></feed>`;
  const [item] = parseFeed(xml, 'Atom');
  assert.equal(item.link, 'https://example.com/b');
  assert.equal(item.summary, 'Short');
});

import { summariseClimate } from '../src/trip.js';
test('climate summary averages past race days', () => {
  assert.deepEqual(summariseClimate([{ max: 30, min: 20, rain: 0 }, { max: 26, min: 18, rain: 4 }, { max: null }]), { years: 2, maxTemp: 28, minTemp: 19, rainyYears: 1 });
  assert.equal(summariseClimate([{ max: null }]), null);
});
