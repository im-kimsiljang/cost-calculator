/**
 * /api/upload-image
 * ------------------------------------------------------------
 * base64 이미지를 NCP Object Storage에 업로드하고 공개 URL 반환
 *
 * 요청 (POST application/json):
 *  { "imageBase64": "data:image/jpeg;base64,...", "key": "ingredients/ing_xxx.jpg" }
 *
 * 응답 (200):
 *  { "ok": true, "url": "https://kimsiljang-images.kr.object.ncloudstorage.com/ingredients/ing_xxx.jpg" }
 *
 * 환경변수 필요:
 *  NCP_ACCESS_KEY, NCP_SECRET_KEY, NCP_BUCKET
 */

import { createHmac, createHash } from 'crypto';

export const config = {
  api: { bodyParser: { sizeLimit: '5mb' } },
};

function hmacSHA256(key, data) {
  return createHmac('sha256', key).update(data).digest();
}
function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}
function getSigningKey(secretKey, dateStamp, region, service) {
  const kDate    = hmacSHA256('AWS4' + secretKey, dateStamp);
  const kRegion  = hmacSHA256(kDate,   region);
  const kService = hmacSHA256(kRegion, service);
  return hmacSHA256(kService, 'aws4_request');
}

async function uploadToNCP({ buffer, key, contentType, accessKey, secretKey, bucket }) {
  const region   = 'kr-standard';
  const endpoint = 'kr.object.ncloudstorage.com';
  const host     = `${bucket}.${endpoint}`;
  const path     = `/${key}`;

  const now       = new Date();
  const amzDate   = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256Hex(buffer);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-acl:public-read\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT', path, '',
    canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');

  const algorithm      = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign   = [algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey  = getSigningKey(secretKey, dateStamp, region, 's3');
  const signature   = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authHeader  =
    `${algorithm} Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type':          contentType,
      'Host':                  host,
      'x-amz-acl':             'public-read',
      'x-amz-content-sha256':  payloadHash,
      'x-amz-date':            amzDate,
      'Authorization':         authHeader,
    },
    body: buffer,
    duplex: 'half', // Node 18+ fetch 필요
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NCP upload failed (${res.status}): ${text}`);
  }

  return `https://${host}${path}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const accessKey = process.env.NCP_ACCESS_KEY;
  const secretKey = process.env.NCP_SECRET_KEY;
  const bucket    = process.env.NCP_BUCKET || 'kimsiljang-images';
  if (!accessKey || !secretKey)
    return res.status(500).json({ ok: false, error: 'NCP credentials not configured' });

  const { imageBase64, key } = req.body || {};
  if (!imageBase64 || !key)
    return res.status(400).json({ ok: false, error: 'imageBase64와 key가 필요합니다' });

  // dataURL 파싱
  let base64Data  = imageBase64;
  let contentType = 'image/jpeg';
  const match = /^data:(image\/[a-z+]+);base64,/i.exec(imageBase64);
  if (match) {
    contentType = match[1].toLowerCase();
    base64Data  = imageBase64.replace(/^data:[^;]+;base64,/, '');
  }

  const buffer = Buffer.from(base64Data, 'base64');

  try {
    const url = await uploadToNCP({ buffer, key, contentType, accessKey, secretKey, bucket });
    return res.status(200).json({ ok: true, url });
  } catch (err) {
    console.error('[upload-image] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
