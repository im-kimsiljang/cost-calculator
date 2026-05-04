/**
 * /api/naver-image
 * ------------------------------------------------------------
 * 식재료명으로 Naver Shopping 이미지를 검색해 썸네일 URL 반환
 *
 * 요청 (POST application/json):
 *  { "query": "포기김치" }
 *
 * 응답 (200):
 *  { "ok": true, "imageUrl": "https://..." }
 *
 * 실패:
 *  { "ok": false, "error": "..." }
 *
 * 환경변수 필요:
 *  NAVER_CLIENT_ID, NAVER_CLIENT_SECRET
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const clientId     = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret)
    return res.status(500).json({ ok: false, error: 'Naver API keys not configured' });

  const { query } = req.body || {};
  if (!query || typeof query !== 'string')
    return res.status(400).json({ ok: false, error: 'query가 필요합니다' });

  try {
    // 1차: Naver Shopping 검색 (상품 이미지가 더 선명하고 관련성 높음)
    const shopRes = await fetch(
      `https://openapi.naver.com/v1/search/shop?query=${encodeURIComponent(query + ' 식재료')}&display=5&sort=sim`,
      {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      }
    );

    if (shopRes.ok) {
      const data = await shopRes.json();
      const items = (data.items || []).filter(i => i.image);
      if (items.length > 0) {
        return res.status(200).json({
          ok: true,
          imageUrl: items[0].image,
          source: 'shopping',
        });
      }
    }

    // 2차: Naver 이미지 검색 (Shopping에서 못 찾으면 일반 이미지)
    const imgRes = await fetch(
      `https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=3&sort=sim&filter=medium`,
      {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      }
    );

    if (imgRes.ok) {
      const data = await imgRes.json();
      const item = (data.items || []).find(i => i.thumbnail);
      if (item) {
        return res.status(200).json({
          ok: true,
          imageUrl: item.thumbnail,
          source: 'image',
        });
      }
    }

    return res.status(200).json({ ok: false, error: '이미지를 찾지 못했어요' });

  } catch (err) {
    console.error('[naver-image] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
