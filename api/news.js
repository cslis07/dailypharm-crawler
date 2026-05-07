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

    const date = $('time').first().text().trim()
      || $('[class*="date"]').first().text().trim()
      || html.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] || '';

    const author = $('[class*="reporter"], [class*="author"], [class*="writer"]').first().text().trim()
      || html.match(/[가-힣]{2,4}\s*기자/)?.[0] || '';

    const preview = $('article p, [class*="content"] p, [class*="body"] p').first().text().trim().substring(0, 100);

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

    $('ul li a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      if (!href.includes('/news/') || href.includes('tip-off')) return;

      const fullText = $el.text().trim();
      const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const title = lines[0] || '';
      if (title.length < 5) return;

      const dateMatch = fullText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      const authorMatch = fullText.match(/[가-힣]{2,4}\s*기자/);
      const previewLine = lines.find(l =>
        l.length > 15 &&
        !l.match(/^\d{4}-/) &&
        !l.match(/[가-힣]{2,4}\s*기자$/) &&
        l !== title
      ) || '';

      const fullUrl = href.startsWith('http') ? href : `https://www.dailypharm.com${href}`;

      rawArticles.push({
        title,
        url: fullUrl,
        date: dateMatch ? dateMatch[0] : '',
        author: authorMatch ? authorMatch[0] : '',
        preview: previewLine.replace(/\[데일리팜=[^\]]*\]/, '').trim().substring(0, 100),
        needDetail: !dateMatch  // 날짜 없으면 상세 페이지 필요
      });
    });

    // limit 적용
    const sliced = rawArticles.slice(0, limit);

    // 날짜 없는 기사만 상세 페이지 병렬 요청
    const detailNeeded = sliced.filter(a => a.needDetail);
    await Promise.all(
      detailNeeded.map(async (article) => {
        const detail = await fetchArticleDetail(article.url);
        article.date = detail.date;
        article.author = detail.author;
        if (!article.preview) article.preview = detail.preview;
      })
    );

    const articles = sliced.map(({ needDetail, ...rest }) => rest);

    return res.status(200).json({ success: true, count: articles.length, articles });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};