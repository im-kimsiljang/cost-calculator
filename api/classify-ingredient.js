/**
 * /api/classify-ingredient
 * ------------------------------------------------------------
 * Claude API를 이용한 식자재 자동 분류 (Vercel Serverless Function).
 *
 * 긴 구매 상품명 → 짧은 식자재명 + 카테고리 자동 추출
 *
 * 요청 (POST application/json):
 *  {
 *    "items": [
 *      { "name": "브라질산정 닭고기육다리살 염지정육 2kg팩조각정육", "amount": 2, "unit": "kg", "price": 15200 },
 *      { "name": "곰곰 대추방울토마토 500g", "amount": 500, "unit": "g", "price": 9990 }
 *    ]
 *  }
 *
 * 응답 (200):
 *  {
 *    "ok": true,
 *    "results": [
 *      { "originalName": "브라질산정 닭고기육다리살 염지정육 2kg팩조각정육", "shortName": "염지닭다리살", "category": "meat" },
 *      { "originalName": "곰곰 대추방울토마토 500g", "shortName": "방울토마토", "category": "vegetable" }
 *    ]
 *  }
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `당신은 식당 식자재 관리 전문가입니다.
사용자가 영수증이나 쇼핑몰에서 구매한 상품의 긴 상품명을 제공하면,
식당에서 실제로 사용하는 짧고 직관적인 식자재명과 카테고리로 분류해주세요.

규칙:
1. 상품명에서 브랜드, 원산지, 포장 단위, 마케팅 문구를 제거하고 핵심 식자재명만 추출
2. 식당 주방에서 부르는 자연스러운 이름으로 (예: "염지닭다리살", "대파", "양배추")
3. 너무 짧지 않게, 구분이 가능한 수준으로 (예: "닭" ✕ → "염지닭다리살" ○)
4. 카테고리는 반드시 다음 중 하나: meat, seafood, vegetable, grain, dairy, sauce, dry, frozen, mealkit, other

반드시 JSON 배열로만 응답하세요. 다른 텍스트 없이 JSON만 출력합니다.
형식: [{"originalName": "원본명", "shortName": "짧은 식자재명", "category": "카테고리"}]`;

export default async function handler(req, res) {
  /* ── CORS ── */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  /* ── API Key 확인 ── */
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' });

  /* ── 요청 파싱 ── */
  const { items } = req.body || {};
  if (!items || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ ok: false, error: 'items 배열이 필요합니다' });

  // 최대 30개까지만 처리
  const limitedItems = items.slice(0, 30);

  const userMessage = limitedItems.map((item, i) =>
    `${i + 1}. "${item.name}"${item.amount ? ` (${item.amount}${item.unit || ''})` : ''}`
  ).join('\n');

  try {
    /* ── Claude API 호출 ── */
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Claude API error:', response.status, errBody);
      return res.status(502).json({ ok: false, error: 'Claude API 호출 실패', status: response.status });
    }

    const data = await response.json();
    const text = (data.content?.[0]?.text || '').trim();

    /* ── JSON 파싱 ── */
    let results;
    try {
      // JSON 블록 추출 (```json ... ``` 감싸는 경우 대응)
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found');
      results = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message, 'Raw:', text);
      return res.status(502).json({ ok: false, error: '분류 결과 파싱 실패', raw: text });
    }

    // 카테고리 유효성 검증
    const validCategories = new Set([
      'meat', 'seafood', 'vegetable', 'grain', 'dairy', 'sauce', 'dry', 'frozen', 'mealkit', 'other'
    ]);
    results = results.map(r => ({
      originalName: r.originalName || '',
      shortName: r.shortName || r.originalName || '',
      category: validCategories.has(r.category) ? r.category : 'other',
    }));

    return res.status(200).json({ ok: true, results });

  } catch (err) {
    console.error('classify-ingredient error:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
}
