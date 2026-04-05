import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

let app = null;
let db = null;
let auth = null;

try {
  // Hanya inisialisasi jika ada API Key yang valid (bukan undefined/kosong)
  if (firebaseConfig.apiKey && firebaseConfig.apiKey !== '' && firebaseConfig.apiKey !== 'undefined') {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
    setPersistence(auth, browserLocalPersistence).catch((error) => {
      console.error("Auth persistence error:", error);
    });
  } else {
    console.warn("API Key Firebase kosong. Berpindah ke mode lokal.");
  }
} catch (error) {
  console.error("Firebase config error:", error);
}

export { db, auth };
