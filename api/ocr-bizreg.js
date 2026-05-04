/**
 * /api/ocr-bizreg
 * ------------------------------------------------------------
 * 사업자등록증 이미지에서 상호명·사업장주소·사업자등록번호 추출
 * Claude Vision API 사용 (Vercel Serverless Function).
 *
 * 요청 (POST application/json):
 *  { "imageBase64": "data:image/jpeg;base64,...." }
 *
 * 응답 (200):
 *  { "ok": true, "storeName": "행복한 돈까스", "address": "서울시 마포구 ...", "bizNo": "000-00-00000" }
 *
 * 실패 응답:
 *  { "ok": false, "error": "..." }
 */

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

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

  const { imageBase64 } = req.body || {};
  if (!imageBase64 || typeof imageBase64 !== 'string')
    return res.status(400).json({ ok: false, error: '이미지가 없습니다.' });

  // dataURL 헤더 분리
  let base64Data = imageBase64;
  let mediaType = 'image/jpeg';
  const dataUrlMatch = /^data:(image\/[a-z+]+);base64,/i.exec(imageBase64);
  if (dataUrlMatch) {
    mediaType = dataUrlMatch[1].toLowerCase();
    base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
  }

  const isPdf = mediaType === 'application/pdf';

  try {
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    };
    // PDF 처리에는 beta 헤더 필요
    if (isPdf) headers['anthropic-beta'] = 'pdfs-2024-09-25';

    const contentBlock = isPdf
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64Data } }
      : { type: 'image',    source: { type: 'base64', media_type: mediaType,          data: base64Data } };

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            {
              type: 'text',
              text: `이 사업자등록증에서 다음 정보를 추출해주세요.
반드시 JSON만 응답하고, 다른 텍스트는 일절 없이 JSON만 출력하세요.

형식: {"storeName": "상호명", "address": "사업장 소재지 전체 주소", "bizNo": "사업자등록번호", "businessType": "업종"}

규칙:
- storeName: 상호 또는 법인명 (예: "행복한 돈까스", 없으면 null)
- address: 사업장 소재지 전체 주소 (예: "서울특별시 마포구 와우산로 10", 없으면 null)
- bizNo: 사업자등록번호 000-00-00000 형식 (없으면 null)
- businessType: 업태 또는 종목 중 더 구체적인 것 (예: "한식", "음식점업", "정보통신업", 없으면 null)
- 사업자등록증이 아닌 경우: {"storeName": null, "address": null, "bizNo": null, "businessType": null}`,
            },
          ],
        }],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      // 전체 에러 메시지를 로그에 남겨 디버깅 가능하게
      console.error('[ocr-bizreg] Claude API error:', response.status, errBody);
      return res.status(502).json({ ok: false, error: `AI 인식 오류 (${response.status})`, detail: errBody });
    }

    const aiData = await response.json();
    const text = (aiData.content?.[0]?.text || '').trim();

    let result;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('[ocr-bizreg] JSON parse error:', parseErr.message, 'Raw:', text);
      return res.status(502).json({ ok: false, error: '인식 결과를 처리할 수 없어요', raw: text });
    }

    return res.status(200).json({
      ok: true,
      storeName: result.storeName || null,
      address: result.address || null,
      bizNo: result.bizNo || null,
      businessType: result.businessType || null,
    });

  } catch (err) {
    console.error('[ocr-bizreg] exception:', err);
    return res.status(500).json({ ok: false, error: err.message || 'Internal error' });
  }
}
