import admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;

  try {
    // Método 1: JSON del Service Account en base64 (MÁS CONFIABLE)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      let serviceAccount;
      
      try {
        // Intentar como base64
        const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_KEY, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(decoded);
        console.log('[Firebase Admin] ✅ Service account loaded from base64');
      } catch {
        try {
          // Intentar como JSON directo
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
          console.log('[Firebase Admin] ✅ Service account loaded from JSON string');
        } catch {
          console.error('[Firebase Admin] ❌ Cannot parse FIREBASE_SERVICE_ACCOUNT_KEY');
          return;
        }
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      console.log('[Firebase Admin] ✅ Initialized with service account for project:', serviceAccount.project_id);
      return;
    }

    // Método 2: Variables individuales (fallback)
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

    if (projectId && clientEmail && privateKeyRaw) {
      const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      console.log('[Firebase Admin] ✅ Initialized with individual env vars');
      return;
    }

    console.error('[Firebase Admin] ❌ No credentials found');
  } catch (error) {
    console.error('[Firebase Admin] ❌ Init error:', error);
  }
}

initFirebase();

export default admin;
