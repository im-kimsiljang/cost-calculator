// 정기결제 취소 (해지)
// - subscription.cancelled = true 로 마킹
// - billingKey 는 유지 (재구독 시 재사용 가능)
// - expiresAt 까지 프리미엄 혜택 유지, 그 후 자동으로 free 전환 (cron 또는 getSubscriptionState)

const { verifyIdToken, getFirestore } = require('../../lib/firebase-admin');

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
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'User document not found' });
    }
    const userData = userSnap.data().data || {};
    const sub = userData.subscription || {};

    if (sub.plan !== 'premium') {
      return res.status(400).json({ error: '활성 구독이 없어요.', code: 'NO_ACTIVE_SUBSCRIPTION' });
    }
    if (sub.cancelled) {
      return res.status(400).json({ error: '이미 취소된 구독이에요.', code: 'ALREADY_CANCELLED' });
    }

    const cancelledAt = new Date().toISOString();
    await userRef.update({
      'data.subscription.cancelled': true,
      'data.subscription.cancelledAt': cancelledAt,
      updatedAt: cancelledAt,
    });

    return res.status(200).json({
      success: true,
      subscription: {
        ...sub,
        cancelled: true,
        cancelledAt,
      },
    });
  } catch (e) {
    console.error('[billing/cancel] error:', e);
    return res.status(500).json({ error: e.message || 'Internal error', code: e.code || 'UNKNOWN' });
  }
};
