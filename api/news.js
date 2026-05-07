import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const group = req.query.group || '종합';
  const url = `https://www.dailypharm.com/user/news?group=${encodeURIComponent(group)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.dailypharm.com/',
      }
    });

    if (!response.ok) {
      return res.status(500).json({ success: false, error: `HTTP ${response.status}` });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const articles = [];

    $('ul li a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      if (!href.includes('/news/') || href.includes('tip-off')) return;

      const fullText = $el.text().trim();
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const title = lines[0] || '';
      if (title.length < 5) return;

      const date = fullText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] || '';
      const author = fullText.match(/[가-힣]{2,4}\s*기자/)?.[0] || '';
      const preview = lines.find(l => l.length > 20 && !l.match(/^\d{4}-/) && !l.includes('기자')) || '';
      const fullUrl = href.startsWith('http') ? href : `https://www.dailypharm.com${href}`;

      articles.push({ title, url: fullUrl, date, author, preview: preview.substring(0, 100) });
    });

    return res.status(200).json({ success: true, count: articles.length, articles });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}