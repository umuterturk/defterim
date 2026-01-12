import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Firebase configuration for Defterim
// Uses the same project as the Flutter app
const firebaseConfig = {
  apiKey: 'AIzaSyBKYfe9HTQpraH1sLkkEDRazCyIDiWKxls',
  authDomain: 'defterim-482110.firebaseapp.com',
  projectId: 'defterim-482110',
  storageBucket: 'defterim-482110.firebasestorage.app',
  messagingSenderId: '896028980362',
  appId: '1:896028980362:web:dfc6ca2ff5c82a5eb5e973',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
