import admin from "firebase-admin";

let serviceAccount: any = null;
try {
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (key) {
    serviceAccount = JSON.parse(key);
  }
} catch (e) {
  console.warn("Firebase: Could not parse FIREBASE_SERVICE_ACCOUNT_KEY");
}

if (!admin.apps.length && 
    serviceAccount && 
    serviceAccount.project_id && 
    !serviceAccount.project_id.includes("PEGAR") &&
    serviceAccount.private_key &&
    !serviceAccount.private_key.includes("PEGAR")
) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (error) {
    console.error("Firebase initialization error:", error);
  }
}

export const sendNotification = async (token: string, title: string, body: string) => {
  const message = {
    notification: {
      title,
      body,
    },
    android: {
      notification: {
        sound: 'default',
        defaultVibrateTimings: false,
        vibrateTimingsMillis: [0, 500, 200, 500], // Vibración distintiva
      }
    },
    apns: {
      payload: {
        aps: {
          sound: 'default'
        }
      }
    },
    token: token,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log("Successfully sent message:", response);
    return response;
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

export default admin;
