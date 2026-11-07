import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAJQ8oZlvExVRF2Ma22_DQ7Va1OFgrJhc0",
  authDomain: "pivotal-pager-514008-d0.firebaseapp.com",
  projectId: "pivotal-pager-514008-d0",
  storageBucket: "pivotal-pager-514008-d0.firebasestorage.app",
  messagingSenderId: "825518131613",
  appId: "1:825518131613:web:a1eec4f3aa39d32622c774",
  measurementId: "G-8CEJ1TKLQH"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google ログイン
const googleProvider = new GoogleAuthProvider();
export const loginWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};

// ゲストログイン（匿名認証）
export const loginAsGuest = async () => {
  const result = await signInAnonymously(auth);
  return result.user;
};
