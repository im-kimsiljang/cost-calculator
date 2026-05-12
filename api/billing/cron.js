// Vercel Cron 엔드포인트 - 매일 1회 호출되어 만료 임박/이미 만료된 구독을 자동 청구.
//
// 동작:
//  1. 만료 D-1 ~ 만료 후 7일 이내의 premium 구독을 모두 조회
//  2. 각 구독에 대해 billingKey 로 4,900원 청구
//  3. 성공: subscription.expiresAt 을 마지막 expiresAt + 30일로 연장
//  4. 실패: subscription.failCount 증가, expiresAt 그대로 (자연 만료)
//  5. failCount >= 7 도달 시 plan='free' 로 강제 만료 (재시도 중단)

const { getFirestore } = require('../../lib/firebase-admin');
const { chargeBilling } = require('../../lib/toss');

const PREMIUM_AMOUNT = 4900;
const PREMIUM_DAYS = 30;
const MAX_RETRY_DAYS = 7;
const CHARGE_WINDOW_BEFORE_MS = 24 * 60 * 60 * 1000; // 만료 24시간 전부터 시도

module.exports = async function handler(req, res) {
  // Vercel Cron 인증 — CRON_SECRET 검증
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return res.status(500).json({ error: 'CRON_SECRET env not set' });
  }
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== expected) {
    return res.status(401).json({ error: 'Unauthorized cron call' });
  }

  const db = getFirestore();
  const now = Date.now();
  const chargeFrom = now + CHARGE_WINDOW_BEFORE_MS; // 24h 안에 만료될 것들 + 이미 만료된 것들

  const summary = {
    scanned: 0,
    charged: 0,
    failed: 0,
    expired: 0,
    skipped: 0,
    details: [],
  };

  try {
    // 만료 임박 (24시간 안에 만료) 또는 이미 만료된 premium 구독 조회
    // Firestore는 단일 inequality만 허용하므로 expiresAt <= chargeFrom 로 필터
    const snapshot = await db
      .collection('users')
      .where('data.subscription.plan', '==', 'premium')
      .where('data.subscription.expiresAt', '<=', new Date(chargeFrom).toISOString())
      .get();

    summary.scanned = snapshot.size;

    for (const userDoc of snapshot.docs) {
      const uid = userDoc.id;
      const userData = userDoc.data().data || {};
      const sub = userData.subscription || {};
      const expiresAt = sub.expiresAt ? new Date(sub.expiresAt).getTime() : 0;
      const failCount = sub.failCount || 0;

      // 취소된 구독: 청구 skip. 만료 시각이 지나면 자동으로 free 전환.
      if (sub.cancelled) {
        if (now > expiresAt) {
          await userDoc.ref.update({
            'data.subscription.plan': 'free',
            'data.subscription.expiredAt': new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
          summary.expired++;
          summary.details.push({ uid, action: 'expired_cancelled' });
        } else {
          summary.skipped++;
          summary.details.push({ uid, action: 'skipped', reason: 'cancelled' });
        }
        continue;
      }

      // 만료 후 MAX_RETRY_DAYS 일 지났으면 자동 만료 (결제 실패 누적)
      const daysAfterExpiry = (now - expiresAt) / (24 * 60 * 60 * 1000);
      if (daysAfterExpiry > MAX_RETRY_DAYS) {
        await userDoc.ref.update({
          'data.subscription.plan': 'free',
          'data.subscription.failedAt': new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        summary.expired++;
        summary.details.push({ uid, action: 'expired', daysAfterExpiry: Math.round(daysAfterExpiry) });
        continue;
      }

      // billingKey 조회
      const billingDoc = await db.collection('billings').doc(uid).get();
      if (!billingDoc.exists) {
        summary.skipped++;
        summary.details.push({ uid, action: 'skipped', reason: 'no_billing_key' });
        continue;
      }
      const billing = billingDoc.data();

      // 토스 청구
      const orderId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${uid.slice(0, 6)}`;
      try {
        const charge = await chargeBilling({
          billingKey: billing.billingKey,
          customerKey: billing.customerKey,
          amount: PREMIUM_AMOUNT,
          orderId,
          orderName: '김실장 프리미엄 1개월 (자동)',
          customerEmail: userData.user?.email || '',
          customerName: userData.user?.name || '',
        });

        // 성공: expiresAt 을 max(현재 expiresAt, now) + 30일 로 연장
        const baseTime = Math.max(expiresAt, now);
        const newExpiresAt = new Date(baseTime + PREMIUM_DAYS * 24 * 60 * 60 * 1000).toISOString();

        await userDoc.ref.update({
          'data.subscription.plan': 'premium',
          'data.subscription.expiresAt': newExpiresAt,
          'data.subscription.lastOrderId': charge.orderId,
          'data.subscription.lastPaymentKey': charge.paymentKey,
          'data.subscription.amount': charge.totalAmount || PREMIUM_AMOUNT,
          'data.subscription.paidAt': charge.approvedAt || new Date().toISOString(),
          'data.subscription.failCount': 0,
          updatedAt: new Date().toISOString(),
        });

        await db.collection('payments').doc(charge.paymentKey).set({
          uid,
          orderId: charge.orderId,
          paymentKey: charge.paymentKey,
          amount: charge.totalAmount || PREMIUM_AMOUNT,
          type: 'subscription-cron',
          status: charge.status || 'DONE',
          method: charge.method || null,
          approvedAt: charge.approvedAt || null,
          createdAt: new Date().toISOString(),
        });

        summary.charged++;
        summary.details.push({ uid, action: 'charged', newExpiresAt });
      } catch (chargeErr) {
        // 실패: failCount 증가, expiresAt 유지
        const newFailCount = failCount + 1;
        await userDoc.ref.update({
          'data.subscription.failCount': newFailCount,
          'data.subscription.lastFailedAt': new Date().toISOString(),
          'data.subscription.lastFailReason': (chargeErr.code || '') + ' ' + (chargeErr.message || '').slice(0, 100),
          updatedAt: new Date().toISOString(),
        });
        summary.failed++;
        summary.details.push({
          uid,
          action: 'failed',
          failCount: newFailCount,
          code: chargeErr.code,
          message: (chargeErr.message || '').slice(0, 80),
        });
      }
    }

    return res.status(200).json({ success: true, summary, ranAt: new Date().toISOString() });
  } catch (e) {
    console.error('[billing/cron] fatal error:', e);
    return res.status(500).json({
      error: e.message || 'Internal error',
      code: e.code || 'UNKNOWN',
      summary,
    });
  }
};
