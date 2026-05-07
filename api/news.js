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

  // 정확한 클래스 셀렉터 사용
  $('a').each((i, el) => {
    const $el = $(el);
    const href = $el.attr('href') || '';
    if (!href.match(/\/user\/news\/\d+/)) return;

    const title = $el.find('.lin_title').text().trim();
    if (!title || title.length < 5) return;

    const preview = $el.find('.lin_cont').text().trim()
      .replace(/\[데일리팜=[^\]]*\]/, '').trim().substring(0, 120);

    const linData = $el.find('.lin_data div');
    const date = $(linData[0]).text().trim();
    const author = $(linData[1]).text().trim();

    const fullUrl = href.startsWith('http') ? href : `https://www.dailypharm.com${href}`;

    articles.push({ title, url: fullUrl, date, author, preview });
  });

  return articles;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const group = req.query.group || '종합';
  const limit = parseInt(req.query.limit) || 20;
  const pagesNeeded = Math.ceil(limit / 10);

  try {
    const pagePromises = [];
    for (let p = 1; p <= pagesNeeded; p++) {
      pagePromises.push(fetchPage(group, p));
    }
    const pageResults = await Promise.all(pagePromises);

    // 중복 제거하며 합치기
    const seen = new Set();
    const allArticles = [];
    for (const articles of pageResults) {
      for (const article of articles) {
        if (!seen.has(article.url)) {
          seen.add(article.url);
          allArticles.push(article);
        }
      }
    }

    const sliced = allArticles.slice(0, limit);
    return res.status(200).json({ success: true, count: sliced.length, articles: sliced });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};