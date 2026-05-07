import * as cheerio from 'cheerio';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const group = req.query.group || '종합';
  const url = `https://www.dailypharm.com/user/news?group=${encodeURIComponent(group)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.dailypharm.com/',
      }
    });

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

      // 날짜: 텍스트에서 추출
      const dateMatch = fullText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      const date = dateMatch ? dateMatch[0]