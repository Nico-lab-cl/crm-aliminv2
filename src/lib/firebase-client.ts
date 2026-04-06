import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Ensure we only initialize if we have the required config to prevent white/black screens
const isConfigValid = 
  firebaseConfig.apiKey && 
  firebaseConfig.projectId && 
  firebaseConfig.appId;

let app;
if (isConfigValid) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
} else {
  console.warn("Firebase client configuration is missing. Notifications might not work.");
}

export const msg = (typeof window !== 'undefined' && app) ? getMessaging(app) : null;

export const requestForToken = async () => {
  if (!msg) {
    console.warn('Firebase messaging not initialized');
    return null;
  }
  try {
    // CRITICAL: Must explicitly request permission first
    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
    
    if (permission !== 'granted') {
      console.warn('Notification permission denied by user');
      return null;
    }

    const currentToken = await getToken(msg, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
    });
    if (currentToken) {
      console.log('FCM token obtained successfully');
      // Save token to server
      const res = await fetch('/api/user/fcm-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: currentToken }),
      });
      if (!res.ok) {
        console.error('Failed to save FCM token to server:', await res.text());
      }
      return currentToken;
    } else {
      console.warn('No FCM token received. Check VAPID key configuration.');
      return null;
    }
  } catch (err) {
    console.error('Error requesting FCM token:', err);
    return null;
  }
};

export const onMessageListener = () =>
  new Promise((resolve) => {
    if (!msg) return;
    onMessage(msg, (payload) => {
      console.log("On message: ", payload);
      resolve(payload);
    });
  });
