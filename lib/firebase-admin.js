const admin = require('firebase-admin');

let initialized = false;

function init() {
  if (initialized || admin.apps.length) {
    initialized = true;
    return;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env not set');
  }
  let serviceAccount;
  try {
    const text = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf-8');
    serviceAccount = JSON.parse(text);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT parse error: ' + e.message);
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  initialized = true;
}

async function verifyIdToken(idToken) {
  init();
  return admin.auth().verifyIdToken(idToken);
}

function getFirestore() {
  init();
  return admin.firestore();
}

module.exports = { verifyIdToken, getFirestore, admin };
