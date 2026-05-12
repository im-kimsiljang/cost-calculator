// 정기결제 취소 철회 (resume)
// - subscription.cancelled = false 로 마킹
// - 기존 billingKey 그대로 사용 → 다음 expiresAt 만료 시 cron 이 자동 청구
// - 새 결제는 발생하지 않음 (이미 결제된 기간은 그대로 사용)

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
      return res.status(400).json({ error: '활성 구독이 없어요. 다시 구독을 시작해 주세요.', code: 'NO_ACTIVE_SUBSCRIPTION' });
    }
    if (!sub.cancelled) {
      return res.status(400).json({ error: '이미 정상 구독 상태예요.', code: 'NOT_CANCELLED' });
    }

    const resumedAt = new Date().toISOString();
    await userRef.update({
      'data.subscription.cancelled': false,
      'data.subscription.resumedAt': resumedAt,
      updatedAt: resumedAt,
    });

    return res.status(200).json({
      success: true,
      subscription: {
        ...sub,
        cancelled: false,
        resumedAt,
      },
    });
  } catch (e) {
    console.error('[billing/resume] error:', e);
    return res.status(500).json({ error: e.message || 'Internal error', code: e.code || 'UNKNOWN' });
  }
};
