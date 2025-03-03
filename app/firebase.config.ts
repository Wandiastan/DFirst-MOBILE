import { initializeApp } from 'firebase/app';
import { 
  initializeAuth,
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged,
  User,
  sendPasswordResetEmail
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyANrQLUcbyk2D1o0M3ByASBxwzN2i9Ha80",
  authDomain: "dfirst-trader.firebaseapp.com",
  projectId: "dfirst-trader",
  storageBucket: "dfirst-trader.firebasestorage.app",
  messagingSenderId: "294986926650",
  appId: "1:294986926650:android:ca22c6d05991c97d5c0303"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app);
const db = getFirestore(app);

// Email validation helper
const isValidEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Auth functions
export const loginWithEmail = async (email: string, password: string) => {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password) {
    throw new Error('Email and password are required');
  }
  if (!isValidEmail(trimmedEmail)) {
    throw new Error('Please enter a valid email address');
  }

  // Login with email and password
  const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);

  // Check admin status
  try {
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
    const isAdmin = userDoc.exists() ? userDoc.data().isAdmin === true : false;
    console.log('[Auth] User logged in:', {
      uid: userCredential.user.uid,
      email: userCredential.user.email,
      isAdmin: isAdmin,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Auth] Error checking admin status:', error);
  }

  return userCredential;
};

export const createAccount = async (email: string, password: string, name: string) => {
  const trimmedEmail = email.trim();
  if (!trimmedEmail || !password || !name) {
    throw new Error('All fields are required');
  }
  if (!isValidEmail(trimmedEmail)) {
    throw new Error('Please enter a valid email address');
  }
  if (password.length < 6) {
    throw new Error('Password should be at least 6 characters');
  }
  const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
  if (userCredential.user) {
    await updateProfile(userCredential.user, { displayName: name });
  }
  return userCredential;
};

export const logout = () => signOut(auth);

export const onAuthChanged = (callback: (user: User | null) => void) => 
  onAuthStateChanged(auth, callback);

export const getCurrentUser = () => auth.currentUser;

export const resetPassword = async (email: string) => {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    throw new Error('Email is required');
  }
  if (!isValidEmail(trimmedEmail)) {
    throw new Error('Please enter a valid email address');
  }
  return sendPasswordResetEmail(auth, trimmedEmail);
};

const firebaseAuth = {
  auth,
  loginWithEmail,
  createAccount,
  logout,
  onAuthChanged,
  getCurrentUser,
  resetPassword
};

export default firebaseAuth; 