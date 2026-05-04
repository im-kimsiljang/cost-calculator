/**
 * /api/crop-ingredient-image
 * ------------------------------------------------------------
 * 온라인 영수증(쿠팡 등) 스크린샷에서 각 상품의 썸네일 위치(bounding box)를
 * Claude Vision으로 감지하여 반환합니다.
 * 클라이언트가 Canvas로 해당 영역을 크롭해서 사용합니다.
 *
 * 요청 (POST application/json):
 *  {
 *    "imageBase64": "data:image/jpeg;base64,...",
 *    "items": [{ "id": "ing_xxx", "name": "양송이버섯" }, ...]
 *  }
 *
 * 응답 (200):
 *  {
 *    "ok": true,
 *    "results": [
 *      { "id": "ing_xxx", "bbox": { "x": 0.02, "y": 0.10, "w": 0.15, "h": 0.08 } },
 *      { "id": "ing_yyy", "bbox": null }
 *    ]
 *  }
 *
 * 환경변수 필요:
 *  ANTHROPIC_API_KEY
 */

export const config = {
  api: { bodyParser: { sizeLimit: '20mb' } },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return res.status(500).json({ ok: false, error: 'ANTHROPIC_API_KEY not configured' });

  const { imageBase64, items } = req.body || {};
  if (!imageBase64 || !Array.isArray(items) || items.length === 0)
    return res.status(400).json({ ok: false, error: 'imageBase64와 items가 필요합니다' });

  // dataURL 헤더 분리
  let base64Data = imageBase64;
  let mediaType = 'image/jpeg';
  const dataUrlMatch = /^data:(image\/[a-z+]+);base64,/i.exec(imageBase64);
  if (dataUrlMatch) {
    mediaType = dataUrlMatch[1].toLowerCase();
    base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
  }

  const itemList = items.map((it, i) => `${i + 1}. ${it.name} (id: "${it.id}")`).join('\n');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            {
              type: 'text',
              text: `이 이미지는 쿠팡 주문 내역(배송 현황) 스크린샷입니다.
아래 각 상품의 제품 사진(정사각형 썸네일) 위치를 정밀하게 찾아주세요.

상품 목록:
${itemList}

[쿠팡 UI 특성]
- 각 상품 행 맨 왼쪽에 정사각형(가로≒세로) 제품 사진이 있습니다
- 제품 사진은 흰색/밝은 배경에 상품 이미지가 담긴 사각형입니다
- 제품 사진 아래(또는 위)에 "배송·주문 현황" 파란색 버튼이 나타날 수 있습니다
  → 이 버튼은 제품 사진이 아닙니다. bbox에 절대 포함 금지
- 제품 사진 크기: 이미지 전체 너비의 약 13~20%

[bbox 지정 규칙 — 매우 중요]
- 오직 제품 상품 이미지(사진)만 선택하세요
- "배송·주문 현황" 버튼, 상품명 텍스트, 배경 UI 절대 포함 금지
- w와 h가 거의 같도록 정사각형에 가깝게 지정하세요 (h가 w보다 크면 안 됨)
- 실제 이미지 테두리에 최대한 타이트하게 맞추세요
- x, y: 제품 사진 좌상단의 이미지 전체 기준 비율 (0.0~1.0)
- w, h: 제품 사진 너비/높이의 이미지 전체 기준 비율 (0.0~1.0)
- 찾을 수 없으면 bbox: null
- 소수점 4자리까지

반드시 JSON만 응답 (설명 없이):
{"results": [{"id": "아이디값", "bbox": {"x": 0.0231, "y": 0.1045, "w": 0.1412, "h": 0.0823}}, {"id": "아이디값2", "bbox": null}]}`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[crop-ingredient-image] Claude API error:', response.status, errBody);
      return res.status(502).json({ ok: false, error: `AI 오류 (${response.status})`, results: [] });
    }

    const aiData = await response.json();
    const text = (aiData.content?.[0]?.text || '').trim();

    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[crop-ingredient-image] JSON parse error:', parseErr.message, 'Raw:', text);
      return res.status(200).json({ ok: false, error: 'JSON 파싱 실패', results: [] });
    }

    return res.status(200).json({ ok: true, results: result.results || [] });
  } catch (err) {
    console.error('[crop-ingredient-image] exception:', err);
    return res.status(500).json({ ok: false, error: err.message, results: [] });
  }
}
