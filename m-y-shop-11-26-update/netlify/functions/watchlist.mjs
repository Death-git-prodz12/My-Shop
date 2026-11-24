import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./_lib/firebase-admin.js";
import { json, requireUser } from "./_lib/http.js";

export const config = { path: "/api/watchlist", method: ["GET", "POST"] };
const MAX_WATCHED = 30;
const normalize = value => Array.isArray(value) ? [...new Set(value.filter(id => typeof id === "string" && id.trim()).map(id => id.trim()))] : [];
const itemDocId = id => Buffer.from(id, "utf8").toString("base64url");

async function migrateAndRead(db, uid) {
  const profileRef = db.collection("users").doc(uid);
  const itemsRef = profileRef.collection("watchlist");
  const itemSnapshot = await itemsRef.get();
  const observed = normalize(itemSnapshot.docs.map(doc => doc.data()?.productId).filter(Boolean));
  return db.runTransaction(async tx => {
    const profileSnapshot = await tx.get(profileRef);
    const listed = normalize(profileSnapshot.data()?.watchedProductIds);
    const ids = (listed.length || !observed.length ? listed : observed).slice(0, MAX_WATCHED);
    const refs = ids.map(id => itemsRef.doc(itemDocId(id)));
    const itemReads = await Promise.all(refs.map(ref => tx.get(ref)));
    const missing = ids.filter((_, index) => !itemReads[index].exists);
    const stale = observed.filter(id => !ids.includes(id));
    if (missing.length || stale.length || !profileSnapshot.exists || listed.length !== ids.length) {
      for (const id of stale) tx.delete(itemsRef.doc(itemDocId(id)));
      for (const id of listed.slice(MAX_WATCHED)) tx.delete(itemsRef.doc(itemDocId(id)));
      for (const id of missing) tx.set(itemsRef.doc(itemDocId(id)), { productId: id, createdAt: FieldValue.serverTimestamp() });
      tx.set(profileRef, { watchedProductIds: ids, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return ids;
  });
}

async function toggle(db, uid, productId) {
  if (!productId || productId.length > 300) throw Object.assign(new Error("Identifiant de produit invalide."), { statusCode: 400 });
  const profileRef = db.collection("users").doc(uid);
  const itemsRef = profileRef.collection("watchlist");
  const itemRef = itemsRef.doc(itemDocId(productId));
  return db.runTransaction(async tx => {
    const [profileSnapshot, itemSnapshot] = await Promise.all([tx.get(profileRef), tx.get(itemRef)]);
    const current = normalize(profileSnapshot.data()?.watchedProductIds).slice(0, MAX_WATCHED);
    const exists = current.includes(productId) || itemSnapshot.exists;
    if (exists) {
      const next = current.filter(id => id !== productId);
      tx.set(profileRef, { watchedProductIds: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      tx.delete(itemRef);
      return { ids: next, added: false, limitReached: false };
    }
    if (current.length >= MAX_WATCHED) return { ids: current, added: false, limitReached: true };
    const next = [...current, productId];
    tx.set(profileRef, { watchedProductIds: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(itemRef, { productId, createdAt: FieldValue.serverTimestamp() });
    return { ids: next, added: true, limitReached: false };
  });
}

async function migrateLocal(db, uid, requestedIds) {
  const legacy = normalize(requestedIds).slice(0, MAX_WATCHED);
  const profileRef = db.collection("users").doc(uid);
  const itemsRef = profileRef.collection("watchlist");
  return db.runTransaction(async tx => {
    const profileSnapshot = await tx.get(profileRef);
    const current = normalize(profileSnapshot.data()?.watchedProductIds).slice(0, MAX_WATCHED);
    if (current.length) return { ids: current, added: false, limitReached: false };
    const refs = legacy.map(id => itemsRef.doc(itemDocId(id)));
    const itemSnapshots = await Promise.all(refs.map(ref => tx.get(ref)));
    const existingIds = legacy.filter((_, index) => itemSnapshots[index].exists);
    if (existingIds.length) return { ids: existingIds, added: false, limitReached: false };
    for (let index = 0; index < legacy.length; index++) {
      tx.set(refs[index], { productId: legacy[index], createdAt: FieldValue.serverTimestamp() });
    }
    tx.set(profileRef, { watchedProductIds: legacy, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ids: legacy, added: false, limitReached: false };
  });
}

export default async function handler(request) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  const db = adminDb(), uid = auth.user.uid;
  try {
    if (request.method === "GET") return json(200, { ids: await migrateAndRead(db, uid), limit: MAX_WATCHED });
    if (request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch { return json(400, { error: "Requête JSON invalide." }); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json(400, { error: "Corps de requête invalide." });
      const result = body.action === "migrate"
        ? await migrateLocal(db, uid, body.ids)
        : await toggle(db, uid, String(body.productId || "").trim());
      return json(200, { ...result, limit: MAX_WATCHED });
    }
    return json(405, { error: "Méthode non autorisée." }, { Allow: "GET, POST" });
  } catch (error) {
    console.error("[MyShop watchlist] Firestore operation failed:", error.message);
    return json(error.statusCode || 503, { error: error.statusCode ? error.message : "La veille est temporairement indisponible. Réessayez." });
  }
}
