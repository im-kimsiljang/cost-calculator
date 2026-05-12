const TOSS_API_BASE = 'https://api.tosspayments.com';

function getAuthHeader() {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error('TOSS_SECRET_KEY env not set');
  const encoded = Buffer.from(secret + ':').toString('base64');
  return `Basic ${encoded}`;
}

async function tossFetch(path, body) {
  const res = await fetch(TOSS_API_BASE + path, {
    method: 'POST',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.message || `Toss API failed: ${path}`);
    err.code = data.code;
    err.status = res.status;
    err.tossResponse = data;
    throw err;
  }
  return data;
}

async function issueBillingKey({ authKey, customerKey }) {
  return tossFetch('/v1/billing/authorizations/issue', { authKey, customerKey });
}

async function chargeBilling({ billingKey, customerKey, amount, orderId, orderName, customerEmail, customerName }) {
  return tossFetch(`/v1/billing/${billingKey}`, {
    customerKey,
    amount,
    orderId,
    orderName,
    customerEmail: customerEmail || undefined,
    customerName: customerName || undefined,
  });
}

module.exports = { issueBillingKey, chargeBilling };
