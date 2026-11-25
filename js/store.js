import { CONFIG } from "./config.js";
import { currentUser, getApiAuthHeaders, watchListItemsSnapshot } from "./firebase.js";
import { normalizeWatchList, MAX_WATCHED_PRODUCTS } from "./watch-policy.js";

const localKey = uid => `myshop:watch:${encodeURIComponent(uid)}`;
const lists = new Map();
const listeners = new Map();

function localRead(uid) {
  try { return normalizeWatchList(JSON.parse(localStorage.getItem(localKey(uid)) || "[]")).slice(0, MAX_WATCHED_PRODUCTS); }
  catch { return []; }
}
function localWrite(uid, list) {
  try { localStorage.setItem(localKey(uid), JSON.stringify(list)); }
  catch (error) { console.warn("[MyShop] Cache locale indisponible.", error); }
}
function remember(uid, ids, notify = false) {
  const list = normalizeWatchList(ids).slice(0, MAX_WATCHED_PRODUCTS);
  lists.set(uid, list);
  localWrite(uid, list);
  if (notify && typeof document !== "undefined") document.dispatchEvent(new CustomEvent("watch:changed", { detail: { external: true } }));
  return list;
}

async function requestWatchList(user, { method = "GET", productId, action, ids } = {}) {
  const base = CONFIG.API_BASE.replace(/\/$/, "");
  const headers = { ...(await getApiAuthHeaders()), ...(method === "POST" ? { "content-type": "application/json" } : {}) };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let response;
  try {
    response = await fetch(`${base}/watchlist`, {
      method, headers, signal: controller.signal,
      ...(method === "POST" ? { body: JSON.stringify({ productId, action, ids }) } : {})
    });
  } finally { clearTimeout(timer); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Synchronisation de la veille impossible (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Le GET serveur migre l'ancien tableau du profil vers users/{uid}/watchlist/{id}.
export async function loadWatchList(user) {
  if (!user?.uid) return [];
  try {
    let result = await requestWatchList(user);
    if (!result.ids?.length) {
      const legacy = localRead(user.uid);
      if (legacy.length) result = await requestWatchList(user, { method: "POST", action: "migrate", ids: legacy });
    }
    return remember(user.uid, result.ids || []);
  } catch (error) {
    console.error("[MyShop] Chargement de la veille Firestore impossible; cache local affiché.", error);
    return remember(user.uid, lists.get(user.uid) || localRead(user.uid));
  }
}

export function watchList(user) {
  return user?.uid ? (lists.get(user.uid) || localRead(user.uid)) : [];
}
export const isWatched = (user, id) => !!user?.uid && watchList(user).includes(String(id));

// La fonction serveur authentifie l'utilisateur et applique le quota dans une transaction Firestore.
export async function toggleWatch(user, id) {
  if (!user?.uid || currentUser()?.uid !== user.uid) throw new Error("Connexion requise.");
  const result = await requestWatchList(user, { method: "POST", productId: String(id || "").trim() });
  const ids = remember(user.uid, result.ids || []);
  return {
    list: ids,
    added: Boolean(result.added),
    limitReached: Boolean(result.limitReached),
    limit: MAX_WATCHED_PRODUCTS
  };
}

// Chaque utilisateur écoute uniquement sa sous-collection Firestore.
export function subscribeWatchList(user) {
  if (!user?.uid) return () => {};
  const uid = user.uid;
  listeners.get(uid)?.();
  const unsubscribe = watchListItemsSnapshot(uid, snapshot => {
    const ids = snapshot.docs.map(item => item.data()?.productId).filter(id => typeof id === "string");
    remember(uid, ids, true);
  }, error => console.warn("[MyShop] Synchronisation temps réel Firestore interrompue.", error));
  listeners.set(uid, unsubscribe);
  return () => { unsubscribe(); if (listeners.get(uid) === unsubscribe) listeners.delete(uid); };
}

if (typeof window !== "undefined") window.addEventListener("storage", event => {
  if (event.key?.startsWith("myshop:watch:")) {
    const uid = decodeURIComponent(event.key.slice("myshop:watch:".length));
    if (lists.has(uid)) remember(uid, localRead(uid), true);
  }
});
