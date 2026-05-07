const cheerio = require('cheerio');
const fetch = require('node-fetch');

async function fetchArticleDetail(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.dailypharm.com/',
      }
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    // 날짜
    const dateMatch = html.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    const date = dateMatch ? dateMatch[0] : '';

    // 기자
    const authorMatch = html.match(/[가-힣]{2,4}\s*기자/);
    const author = authorMatch ? authorMatch[0] : '데일리팜';

    // 미리보기: 본문 첫 문장
    let preview = '';
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && !preview) {
        preview = text.replace(/\[데일리팜=[^\]]*\]/, '').trim().substring(0, 100);
      }
    });

    return { date, author, preview };
  } catch {
    return { date: '', author: '', preview: '' };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const group = req.query.group || '종합';
  const limit = parseInt(req.query.limit) || 20;
  const url = `https://www.dailypharm.com/user/news?group=${encodeURIComponent(group)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.dailypharm.com/',
      }
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const rawArticles = [];
    const seen = new Set();

    $('ul li a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      if (!href.includes('/news/') || href.includes('tip-off')) return;

      const fullUrl = href.startsWith('http') ? href : `https://www.dailypharm.com${href}`;
      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      const fullText = $el.text().trim();
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const title = lines[0] || '';
      if (title.length < 5) return;

      // 날짜: 정확히 YYYY-MM-DD HH:MM:SS 형태만
      const dateMatch = fullText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      const date = dateMatch ? dateMatch[0] : '';

      // 기자
      const authorMatch = fullText.match(/[가-힣]{2,4}\s*기자/);
      const author = authorMatch ? authorMatch[0] : '';

      // 미리보기
      const previewLine = lines.find(l =>
        l.length > 15 &&
        !l.match(/^\d{4}-/) &&
        !l.match(/[가-힣]{2,4}\s*기자$/) &&
        l !== title
      ) || '';
      const preview = previewLine.replace(/\[데일리팜=[^\]]*\]/, '').trim().substring(0, 100);

      rawArticles.push({ title, url: fullUrl, date, author, preview });
    });

    // limit 적용
    const sliced = rawArticles.slice(0, limit);

    // 날짜 or 기자 없는 기사만 상세 페이지 병렬 요청
    await Promise.all(
      sliced
        .filter(a => !a.date || !a.author)
        .map(async (article) => {
          const detail = await fetchArticleDetail(article.url);
          if (!article.date) article.date = detail.date;
          if (!article.author) article.author = detail.author || '데일리팜';
          if (!article.preview) article.preview = detail.preview;
        })
    );

    return res.status(200).json({ success: true, count: sliced.length, articles: sliced });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};