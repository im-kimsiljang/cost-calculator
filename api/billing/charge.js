const { verifyIdToken, getFirestore } = require('../../lib/firebase-admin');
const { chargeBilling } = require('../../lib/toss');

const PREMIUM_AMOUNT = 4900;
const PREMIUM_DAYS = 30;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!idToken) return res.status(401).json({ error: 'No auth token' });

    const decoded = await verifyIdToken(idToken);
    const uid = decoded.uid;

    const db = getFirestore();
    const billingDoc = await db.collection('billings').doc(uid).get();
    if (!billingDoc.exists) {
      return res.status(404).json({ error: 'NO_BILLING_KEY', message: '등록된 카드가 없어요. 먼저 카드를 등록해 주세요.' });
    }
    const billing = billingDoc.data();

    const orderId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const charge = await chargeBilling({
      billingKey: billing.billingKey,
      customerKey: billing.customerKey,
      amount: PREMIUM_AMOUNT,
      orderId,
      orderName: '김실장 프리미엄 1개월',
      customerEmail: decoded.email || '',
      customerName: decoded.name || '',
    });

    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const prevData = userDoc.exists ? (userDoc.data().data || {}) : {};
    const prev = prevData.subscription || {};
    const prevExpiry = prev.expiresAt ? new Date(prev.expiresAt).getTime() : 0;
    const baseTime = Math.max(prevExpiry, Date.now());
    const expiresAt = new Date(baseTime + PREMIUM_DAYS * 86400000).toISOString();
    const subscription = {
      plan: 'premium',
      expiresAt,
      lastOrderId: charge.orderId,
      lastPaymentKey: charge.paymentKey,
      amount: charge.totalAmount || PREMIUM_AMOUNT,
      paidAt: charge.approvedAt || new Date().toISOString(),
    };

    // 프론트는 users/{uid}.data.subscription 경로에서 읽으므로 동일한 경로에 저장
    if (userDoc.exists) {
      await userRef.update({
        'data.subscription': subscription,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await userRef.set({
        data: { subscription },
        updatedAt: new Date().toISOString(),
      });
    }

    await db.collection('payments').doc(charge.paymentKey).set({
      uid,
      orderId: charge.orderId,
      paymentKey: charge.paymentKey,
      amount: charge.totalAmount || PREMIUM_AMOUNT,
      type: 'subscription-renewal',
      status: charge.status || 'DONE',
      method: charge.method || null,
      approvedAt: charge.approvedAt || null,
      createdAt: new Date().toISOString(),
    });

    return res.status(200).json({ success: true, subscription });
  } catch (e) {
    console.error('[billing/charge] error:', e);
    return res.status(e.status || 500).json({
      error: e.message || 'Internal error',
      code: e.code || 'UNKNOWN',
      tossResponse: e.tossResponse || null,
    });
  }
};
