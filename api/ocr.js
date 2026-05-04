/**
 * /api/ocr
 * ------------------------------------------------------------
 * CLOVA OCR 영수증 특화 모델 호출 프록시 (Vercel Serverless Function).
 *
 * Why a proxy?
 *  - Secret Key를 브라우저에 노출하지 않으려고 (노출시 누구나 호출 가능)
 *  - CORS 우회 (네이버 API Gateway는 브라우저 직호출 차단)
 *
 * 요청 (POST application/json):
 *  {
 *    "imageBase64": "data:image/jpeg;base64,....",   // dataURL 또는 순수 base64
 *    "format": "jpg"                                 // (optional) jpg | png | pdf | tiff
 *  }
 *
 * 응답 (200):
 *  {
 *    "ok": true,
 *    "vendor": "쿠팡",              // 매장명 (자동 감지, 없으면 null)
 *    "date": "2026-04-08",          // 구매일 (YYYY-MM-DD, 없으면 null)
 *    "items": [                      // 품목 리스트
 *      {
 *        "name": "곰곰 대추방울토마토",
 *        "amount": 2,                // 수량/용량(숫자), 파싱 실패시 null
 *        "unit": "kg",               // 단위 (kg/g/L/mL/개), 실패시 null
 *        "price": 9990,              // 단가(원), 실패시 null
 *        "quantity": 1,              // 구매 개수, 기본 1
 *        "isFoodItem": true          // 식재료로 보이는지 휴리스틱 판정
 *      },
 *      ...
 *    ]
 *  }
 *
 * 실패 응답 (4xx/5xx):
 *  { "ok": false, "error": "사람이 읽을 수 있는 메시지", "code": "CODE" }
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb', // 영수증 사진 (리사이즈 후 보통 1-3MB)
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed', code: 'METHOD' });
  }

  const url = process.env.CLOVA_OCR_URL;
  const secret = process.env.CLOVA_OCR_SECRET;
  if (!url || !secret) {
    return res.status(500).json({
      ok: false,
      error: '서버에 CLOVA OCR 설정이 없습니다. 관리자에게 문의하세요.',
      code: 'NO_ENV',
    });
  }

  try {
    const { imageBase64, format } = req.body || {};
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ ok: false, error: '이미지가 없습니다.', code: 'NO_IMAGE' });
    }

    // dataURL이면 헤더 떼기
    let data = imageBase64;
    let detectedFormat = format;
    const dataUrlMatch = /^data:image\/(jpe?g|png|tiff?|pdf);base64,/i.exec(data);
    if (dataUrlMatch) {
      detectedFormat = detectedFormat || (dataUrlMatch[1].toLowerCase().startsWith('jp') ? 'jpg' : dataUrlMatch[1].toLowerCase());
      data = data.replace(/^data:[^;]+;base64,/, '');
    }
    detectedFormat = detectedFormat || 'jpg';
    if (detectedFormat === 'jpeg') detectedFormat = 'jpg';
    if (detectedFormat === 'tif') detectedFormat = 'tiff';

    // CLOVA OCR V2 요청 포맷
    const payload = {
      version: 'V2',
      requestId: 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      lang: 'ko',
      images: [
        {
          format: detectedFormat,
          name: 'receipt',
          data,
        },
      ],
    };

    const clovaRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OCR-SECRET': secret,
      },
      body: JSON.stringify(payload),
    });

    if (!clovaRes.ok) {
      const body = await clovaRes.text();
      console.error('[ocr] CLOVA error', clovaRes.status, body);
      return res.status(502).json({
        ok: false,
        error: '영수증 인식 서버가 응답하지 않아요. 잠시 후 다시 시도해주세요.',
        code: 'UPSTREAM_' + clovaRes.status,
      });
    }

    const clovaJson = await clovaRes.json();
    const parsed = parseClovaReceipt(clovaJson);
    return res.status(200).json({ ok: true, ...parsed, _raw: undefined });
  } catch (err) {
    console.error('[ocr] exception', err);
    return res.status(500).json({
      ok: false,
      error: '영수증을 처리하는 중 오류가 발생했습니다.',
      code: 'EXCEPTION',
    });
  }
}

// ────────────────────────────────────────────────────────────
// CLOVA 영수증 V2 응답 파서
// ────────────────────────────────────────────────────────────

function parseClovaReceipt(clovaJson) {
  const image = clovaJson && Array.isArray(clovaJson.images) ? clovaJson.images[0] : null;
  const receipt = image && image.receipt && image.receipt.result ? image.receipt.result : null;

  if (!receipt) {
    return { vendor: null, date: null, items: [] };
  }

  // ── 매장명 ──
  const storeName = pickText(receipt.storeInfo && receipt.storeInfo.name);
  const vendor = normalizeVendor(storeName, image);

  // ── 날짜 ──
  const paymentDate =
    pickText(receipt.paymentInfo && receipt.paymentInfo.date && receipt.paymentInfo.date.formatted) ||
    pickText(receipt.paymentInfo && receipt.paymentInfo.date);
  const date = parseDate(paymentDate);

  // ── 품목 ──
  // subResults는 배열. 일반적으로 첫 요소에 items 배열이 있음.
  const items = [];
  const subResults = Array.isArray(receipt.subResults) ? receipt.subResults : [];
  for (const sub of subResults) {
    const rawItems = Array.isArray(sub.items) ? sub.items : [];
    for (const raw of rawItems) {
      const item = parseItem(raw);
      if (item) items.push(item);
    }
  }

  const receiptType = detectReceiptType(collectAllTexts(image), vendor);
  return { vendor, date, items, receiptType };
}

function pickText(obj) {
  if (!obj) return '';
  if (typeof obj === 'string') return obj.trim();
  if (typeof obj === 'object') {
    if (typeof obj.text === 'string') return obj.text.trim();
    if (typeof obj.formatted === 'object') {
      // date.formatted = { year, month, day, ... }
      if (obj.formatted.year && obj.formatted.month && obj.formatted.day) {
        return `${obj.formatted.year}-${pad2(obj.formatted.month)}-${pad2(obj.formatted.day)}`;
      }
      if (typeof obj.formatted.value === 'string') return obj.formatted.value.trim();
    }
    if (typeof obj.formatted === 'string') return obj.formatted.trim();
    if (typeof obj.value === 'string') return obj.value.trim();
  }
  return '';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function parseDate(s) {
  if (!s) return null;
  // 이미 YYYY-MM-DD 형태
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return `${iso[1]}-${pad2(iso[2])}-${pad2(iso[3])}`;
  // YYYY.MM.DD / YYYY/MM/DD / YYYY년 MM월 DD일
  const m = /(\d{4})[.\-\/년\s]+(\d{1,2})[.\-\/월\s]+(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  return null;
}

function parseItem(raw) {
  const name = pickText(raw.name);
  if (!name || name.length < 1) return null;

  const price = parseInt(stripNum(pickText(raw.price && (raw.price.price || raw.price))), 10);
  const unitPrice = parseInt(stripNum(pickText(raw.unitPrice)), 10);

  // count는 구매 개수 (쿠팡 주문내역에 "1개" 같은 값)
  const countStr = pickText(raw.count);
  const quantity = parseInt(stripNum(countStr), 10) || 1;

  // 품목명에서 용량/단위 추출. (예: "곰곰 대추방울토마토, 2kg, 1개" → amount=2, unit=kg)
  const { amount, unit, cleanName } = extractAmountUnit(name);

  const finalPrice = Number.isFinite(price) && price > 0 ? price : (Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : null);

  return {
    name: cleanName,
    amount: amount != null ? amount : null,
    unit: unit || null,
    price: finalPrice,
    quantity,
    isFoodItem: looksLikeFood(cleanName),
  };
}

function stripNum(s) {
  if (!s) return '';
  return String(s).replace(/[,\s원]/g, '');
}

// 품목명에서 용량 추출:
//   "곰곰 대추방울토마토, 2kg, 1개"   → amount=2,   unit=kg,  cleanName="곰곰 대추방울토마토"
//   "풀무원 무항생제 목초란, 15구, 1개" → amount=15, unit=개, cleanName="풀무원 무항생제 목초란"
//   "양파 500g"                        → amount=500, unit=g, cleanName="양파"
//   "사쯔마아게 와카메(8)"             → cleanName="사쯔마아게 와카메"
//   "자바카레 1000 하우스(2)"          → cleanName="자바카레 하우스"  (1000도 수량일 확률 높음)
function extractAmountUnit(name) {
  if (!name) return { amount: null, unit: null, cleanName: '' };
  let cleanName = name;

  // 우선순위가 높은 단위 패턴 (kg, g, L, ml, 리터 등)
  const weightPattern = /([\d.]+)\s*(kg|g|L|l|ml|mL|ML|리터|그램|킬로)/;
  let m = weightPattern.exec(name);
  let amount = null;
  let unit = null;
  if (m) {
    amount = parseFloat(m[1]);
    unit = normalizeUnit(m[2]);
  } else {
    // 구/개/팩 등
    const countPattern = /([\d.]+)\s*(개|구|팩|통|박스|봉|입|미|마리|송이|단|장|포)/;
    m = countPattern.exec(name);
    if (m) {
      amount = parseFloat(m[1]);
      unit = normalizeUnit(m[2]);
    }
  }

  // 이름 정리: 매칭된 용량 부분과 그 뒤 "1개"(구매수량) 같은 꼬리를 제거
  // 콤마/점 구분자로 split 해서 용량·수량 토큰을 뺀다.
  const tokens = name.split(/[,،·]/).map(t => t.trim()).filter(Boolean);
  if (tokens.length >= 2) {
    // "A, 2kg, 1개" 형태 — 첫 토큰만 이름으로
    cleanName = tokens[0];
  } else if (m) {
    // "양파 500g" 형태 — 매칭된 부분 제거
    cleanName = name.replace(m[0], '').trim();
  }

  // 추가 정리: 괄호 안의 숫자 (수량 표기) 제거
  //   "사쯔마아게 와카메(8)" → "사쯔마아게 와카메"
  //   "생와사비303 아주존(24) ..." → "생와사비303 아주존"
  cleanName = cleanName.replace(/[\(\[\{]\s*\d+\s*[\)\]\}]/g, ' ');
  // 마지막 ... 또는 … 제거
  cleanName = cleanName.replace(/[.\u2026]+\s*$/g, '');
  // 끝에 남은 단독 수량 토큰 제거 (예: 이름 끝의 " 1개", " 2팩")
  cleanName = cleanName.replace(/\s+\d+\s*(개|구|팩|통|박스|봉|입|미|마리|송이|단|장|포)\s*$/g, '');
  // 여러 공백 정리
  cleanName = cleanName.replace(/\s{2,}/g, ' ').trim();
  if (!cleanName) cleanName = name;

  return { amount, unit, cleanName };
}

function normalizeUnit(u) {
  if (!u) return null;
  const x = u.toLowerCase();
  if (x === 'kg' || x === '킬로') return 'kg';
  if (x === 'g' || x === '그램') return 'g';
  if (x === 'l' || x === '리터') return 'L';
  if (x === 'ml') return 'mL';
  // 개수 단위는 '개'로 통일 (구/팩/통/박스/봉/입/미/마리/송이/단/장/포 → 개)
  return '개';
}

// 매장명 정규화 (대표 브랜드 통일)
function normalizeVendor(storeName, image) {
  const s = (storeName || '').trim();

  // 전체 이미지에 드러난 텍스트로 쿠팡 주문내역 캡처인지 추가 판정
  const allTexts = collectAllTexts(image);
  const hay = (s + ' ' + allTexts).toLowerCase();

  if (/쿠팡|coupang|로켓프레시|로켓와우/i.test(hay)) return '쿠팡';
  if (/이마트|emart/i.test(hay)) return '이마트';
  if (/홈플러스|homeplus/i.test(hay)) return '홈플러스';
  if (/롯데마트|lottemart/i.test(hay)) return '롯데마트';
  if (/코스트코|costco/i.test(hay)) return '코스트코';
  if (/마켓컬리|kurly|컬리/i.test(hay)) return '마켓컬리';
  if (/gs.?25|gs25/i.test(hay)) return 'GS25';
  if (/cu편의점|\bcu\b/i.test(hay)) return 'CU';
  if (/세븐일레븐|7.?eleven/i.test(hay)) return '세븐일레븐';
  if (/하나로마트|농협/i.test(hay)) return '하나로마트';
  if (/네이버|스마트스토어|네이버쇼핑/i.test(hay)) return '네이버';
  if (/배달의민족|배민|baemin/i.test(hay)) return '배달의민족';

  // 매장명이 있으면 그걸 사용 (정제)
  if (s) return s.replace(/\s+/g, ' ').slice(0, 20);
  return null;
}

// CLOVA 응답 어디든 있을 수 있는 텍스트를 다 모아서 문자열로 리턴 (매장명 휴리스틱용)
function collectAllTexts(image) {
  if (!image) return '';
  const out = [];
  // 일반 텍스트 필드
  const fields = Array.isArray(image.fields) ? image.fields : [];
  for (const f of fields) {
    if (f && typeof f.inferText === 'string') out.push(f.inferText);
  }
  // 영수증 subResults items name
  const receipt = image.receipt && image.receipt.result ? image.receipt.result : null;
  if (receipt && Array.isArray(receipt.subResults)) {
    for (const sub of receipt.subResults) {
      const items = Array.isArray(sub.items) ? sub.items : [];
      for (const it of items) {
        const nm = pickText(it.name);
        if (nm) out.push(nm);
      }
    }
  }
  return out.join(' ');
}

// ── 영수증 유형 감지 (감열지 오프라인 vs 온라인 캡처) ──
// 'thermal' = 흰 감열지 (오프라인 매장)
// 'screenshot' = 온라인 주문내역 캡처
// 'unknown' = 판단 불가
function detectReceiptType(allTexts, vendor) {
  const text = (allTexts || '').toLowerCase();

  // 온라인/캡처 지표 (주문내역 화면 키워드)
  const onlineHits = [
    /주문번호/, /배송지/, /수취인/, /배송완료/, /구매확정/, /결제완료/,
    /주문상품/, /로켓배송/, /로켓프레시/, /배송\s*현황/, /배송추적/,
    /총\s*결제금액/, /쿠폰\s*할인/, /포인트\s*사용/, /배송비\s*무료/,
  ].filter(r => r.test(text)).length;

  // 감열지/오프라인 지표 (매장 영수증 고유 키워드)
  const thermalHits = [
    /현금영수증/, /승인번호/, /카드승인/, /사업자등록번호/,
    /부가세/, /\bvat\b/, /받을금액/, /거스름돈/, /총합계/,
  ].filter(r => r.test(text)).length;

  // 알려진 온라인 전용 업체면 바로 온라인
  const knownOnlineVendors = ['쿠팡', '마켓컬리', '컬리', '네이버', '배달의민족', '이웃삼촌', '식봄', '오아시스', 'ssg'];
  if (knownOnlineVendors.some(v => (vendor || '').toLowerCase().includes(v.toLowerCase()))) return 'screenshot';

  if (onlineHits >= 2) return 'screenshot';
  if (thermalHits >= 2) return 'thermal';
  if (onlineHits > thermalHits) return 'screenshot';
  if (thermalHits > onlineHits) return 'thermal';
  return 'unknown';
}

// 휴리스틱: 품목명이 식재료/식품으로 보이는지
// true = 기본 체크됨 / false = 기본 해제됨
function looksLikeFood(name) {
  if (!name) return false;
  const blacklist = [
    /배송비/, /할인/, /쿠폰/, /포인트/, /적립/, /결제/, /합계/, /총액/, /부가세/, /vat/i,
    /배송·?주문 ?관리/, /바로구매/, /장바구니/, /접기/, /펼치기/, /전체 ?상품/,
    /휴지|티슈|면봉|칫솔|샴푸|린스|바디|세제|주방세제|수세미|고무장갑|쓰레기봉투/,
    /건전지|배터리|충전/, /택배|주문번호|운송장/,
  ];
  for (const re of blacklist) {
    if (re.test(name)) return false;
  }
  return true;
}
