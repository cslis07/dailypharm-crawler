import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const group = req.query.group || '종합';
  const url = `https://www.dailypharm.com/user/news?group=${encodeURIComponent(group)}`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = await response.text();
    const $ = cheerio.load(html);
    const articles = [];

    $('ul li a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      if (!href.includes('/news/')) return;

      const fullText = $el.text().trim();
      const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
      const title = lines[0] || '';
      const date = fullText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] || '';
      const author = fullText.match(/([가-힣]{2,4}\s*기자)/)?.[0] || '';
      const preview = lines[1] || '';
      const fullUrl = href.startsWith('http') ? href : `https://www.dailypharm.com${href}`;

      if (title.length > 5) {
        articles.push({ title, url: fullUrl, date, author, preview });
      }
    });

    res.status(200).json({ success: true, count: articles.length, articles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}