const cheerio = require('cheerio');
const fetch = require('node-fetch');

async function fetchPage(group, page) {
  const url = `https://www.dailypharm.com/user/news?group=${encodeURIComponent(group)}&page=${page}`;
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
    if (!href.match(/\/news\/\d+/)) return;

    const fullUrl = href.startsWith('http') ? href : `https://www.dailypharm.com${href}`;
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
    const preview = previewLine.replace(/\[데일리팜=[^\]]*\]/, '').trim().substring(0, 100);

    articles.push({
      title,
      url: fullUrl,
      date: dateMatch ? dateMatch[0] : '',
      author: authorMatch ? authorMatch[0] : '',
      preview
    });
  });

  return articles;
}

async function fetchArticleDetail(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://www.dailypharm.com/',
      }
    });
    const html = await res.text();
    const $ = cheerio.load(html);

    const dateMatch = html.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    const authorMatch = html.match(/[가-힣]{2,4}\s*기자/);
    let preview = '';
    $('p').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 20 && !preview) {
        preview = text.replace(/\[데일리팜=[^\]]*\]/, '').trim().substring(0, 100);
      }
    });

    return {
      date: dateMatch ? dateMatch[0] : '',
      author: authorMatch ? authorMatch[0] : '데일리팜',
      preview
    };
  } catch {
    return { date: '', author: '데일리팜', preview: '' };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const group = req.query.group || '종합';
  const limit = parseInt(req.query.limit) || 20;

  // 필요한 페이지 수 계산 (페이지당 약 10개)
  const pagesNeeded = Math.ceil(limit / 10);

  try {
    // 여러 페이지 병렬 요청
    const pagePromises = [];
    for (let p = 1; p <= pagesNeeded; p++) {
      pagePromises.push(fetchPage(group, p));
    }
    const pageResults = await Promise.all(pagePromises);

    // 중복 제거하며 합치기
    const seen = new Set();
    const rawArticles = [];
    for (const articles of pageResults) {
      for (const article of articles) {
        if (!seen.has(article.url)) {
          seen.add(article.url);
          rawArticles.push(article);
        }
      }
    }

    // limit 적용
    const sliced = rawArticles.slice(0, limit);

    // 날짜·기자 없는 기사만 상세 페이지 요청
    await Promise.all(
      sliced
        .filter(a => !a.date || !a.author)
        .map(async (article) => {
          const detail = await fetchArticleDetail(article.url);
          if (!article.date) article.date = detail.date;
          if (!article.author) article.author = detail.author;
          if (!article.preview) article.preview = detail.preview;
        })
    );

    return res.status(200).json({ success: true, count: sliced.length, articles: sliced });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};