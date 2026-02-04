// Firebase SDK for AdminSide (React Native/Expo)
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAR4qxgZ3Hby17weDvxGbvGRNHhsR7v-EY",
  authDomain: "qr-based-driver-vehicle.firebaseapp.com",
  projectId: "qr-based-driver-vehicle",
  storageBucket: "qr-based-driver-vehicle.firebasestorage.app",
  messagingSenderId: "729947875572",
  appId: "1:729947875572:web:813c610b9842cec73456a1",
  measurementId: "G-D043MK5QV7",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
