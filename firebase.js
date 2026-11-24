import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, updateProfile }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, collection, onSnapshot }
  from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { CONFIG } from "./config.js";

const app = initializeApp(CONFIG.firebase);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
getRedirectResult(auth).catch(() => {});

// Résout avec l'utilisateur (ou null) dès que Firebase a restauré la session.
export const authReady = new Promise(res => { const off = onAuthStateChanged(auth, u => { off(); res(u); }); });
export const onUser = cb => onAuthStateChanged(auth, cb);
export const currentUser = () => auth.currentUser;
export async function updateDisplayName(displayName) {
  const user = auth.currentUser;
  if (!user) throw new Error("Connexion requise.");
  await updateProfile(user, { displayName });
}
export async function logOut() {
  try { localStorage.clear(); } catch { /* storage may be disabled by browser policy */ }
  try { sessionStorage.clear(); } catch { /* storage may be disabled by browser policy */ }
  await signOut(auth);
}
export const watchProfileRef = uid => doc(db, "users", uid);
export const watchListItemsRef = uid => collection(db, "users", uid, "watchlist");
export const watchListItemsSnapshot = (uid, next, error) => onSnapshot(watchListItemsRef(uid), next, error);
export const getApiAuthHeaders = async () => {
  if (auth.currentUser) return { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` };
  return {};
};

export async function signIn() {
  try { return (await signInWithPopup(auth, provider)).user; }
  catch (e) {
    if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment"].includes(e.code)) {
      await signInWithRedirect(auth, provider); return null;
    }
    throw e;
  }
}

export const loginError = e => ({
  "auth/unauthorized-domain": "Ce domaine n'est pas autorisé : ajoutez-le dans Firebase, Authentication, Settings, Authorized domains.",
  "auth/popup-closed-by-user": "Connexion annulée.",
  "auth/cancelled-popup-request": "Connexion annulée.",
  "auth/network-request-failed": "Réseau indisponible."
}[e.code] || "Connexion impossible (" + (e.code || e.message) + ").");
