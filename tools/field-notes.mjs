// Regenerates every list of Field Notes from field-notes/notes.json.
// Run after adding or editing an entry:  node tools/field-notes.mjs
// No dependencies. To add a note: copy field-notes/ai-code-engineering-judgment/ to a new slug,
// write the article, add its entry to field-notes/notes.json, then run this script.
// Article bodies stay hand-written HTML in field-notes/<slug>/index.html.
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'https://www.chiranjitkarmakar.com/codeworm/';
const notes = JSON.parse(readFileSync('field-notes/notes.json', 'utf8')).sort((a, b) => a.number.localeCompare(b.number));
const latest = [...notes].reverse();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const row = (n, href, h) => `<article class="note-row">
            <p class="note-row__num" aria-hidden="true">${n.number}</p>
            <div class="note-row__body">
              <p class="note-row__cat">${esc(n.category)}</p>
              <h${h} class="note-row__title"><a href="${href}">${esc(n.title)}</a></h${h}>
              <p class="note-row__sub">${esc(n.subtitle)}</p>
              <p class="note-row__meta"><span>Field Note ${n.number}</span><span>${esc(n.readingTime)} read</span><time datetime="${n.date}">${n.date}</time></p>
            </div>
          </article>`;

const next = String(Number(notes.at(-1).number) + 1).padStart(3, '0');
const regions = {
  'field-notes/index.html': ['index', notes.map((n) => row(n, `${n.slug}/`, 3)).join('\n          ') +
    `\n          <article class="note-row note-row--next">
            <p class="note-row__num" aria-hidden="true">${next}</p>
            <div class="note-row__body"><p class="note-row__sub">Published when the investigation is done — not before.</p></div>
          </article>`],
  'index.html': ['home', latest.slice(0, 3).map((n) => row(n, `field-notes/${n.slug}/`, 3)).join('\n          ')],
  'sitemap.xml': ['sitemap', [`<url><loc>${BASE}field-notes/</loc><lastmod>${latest[0].date}</lastmod></url>`,
    ...notes.map((n) => `<url><loc>${BASE}field-notes/${n.slug}/</loc><lastmod>${n.date}</lastmod></url>`)].join('\n  ')],
};

for (const [file, [name, html]] of Object.entries(regions)) {
  const pad = name === 'sitemap' ? '  ' : '          ';
  const re = new RegExp(`(<!-- notes:${name}:start -->)[^]*?(<!-- notes:${name}:end -->)`);
  const src = readFileSync(file, 'utf8');
  if (!re.test(src)) throw new Error(`${file}: missing notes:${name} markers`);
  writeFileSync(file, src.replace(re, (_, a, b) => `${a}\n${pad}${html}\n${pad}${b}`));
}

const rfc822 = (d) => new Date(d + 'T09:00:00Z').toUTCString();
writeFileSync('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>CODEWORM Field Notes</title>
    <link>${BASE}field-notes/</link>
    <atom:link href="${BASE}feed.xml" rel="self" type="application/rss+xml"/>
    <description>Short investigations into software, AI, engineering judgment, architecture, failure and security.</description>
    <language>en</language>
${latest.map((n) => `    <item>
      <title>${esc(n.title)}</title>
      <link>${BASE}field-notes/${n.slug}/</link>
      <guid isPermaLink="true">${BASE}field-notes/${n.slug}/</guid>
      <pubDate>${rfc822(n.date)}</pubDate>
      <category>${esc(n.category)}</category>
      <description>${esc(n.description)}</description>
    </item>`).join('\n')}
  </channel>
</rss>
`);
console.log(`Field Notes: ${notes.length} note(s) written to index, home, sitemap and feed.`);
