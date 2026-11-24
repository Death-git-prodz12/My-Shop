import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { adminDb } from "./_lib/firebase-admin.js";
import { json, requireUser } from "./_lib/http.js";

export const config = { path: "/api/products", method: "GET" };

async function localFallback() {
  const file = join(process.cwd(), "data", "products.json");
  const parsed = JSON.parse(await readFile(file, "utf8"));
  return Array.isArray(parsed) ? parsed : parsed.products || [];
}

function productUrlKey(product) {
  try {
    const url = new URL(product.sourceUrl || product.url || product.link);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch { return ""; }
}

function mergeWithReference(reference, live) {
  const products = [...reference];
  const used = new Set();
  for (const current of live) {
    let index = products.findIndex((item, i) => !used.has(i) && String(item.id || "") === String(current.id || ""));
    const key = productUrlKey(current);
    if (index < 0 && key) index = products.findIndex((item, i) => !used.has(i) && productUrlKey(item) === key);
    if (index >= 0) {
      const legacyId = products[index].id || current.id;
      products[index] = { ...products[index], ...current, id: legacyId, sourceProductId: current.id };
      used.add(index);
    } else products.push(current);
  }
  return products;
}

export default async function handler(request) {
  const auth = await requireUser(request);
  if (auth.error) return auth.error;
  try {
    const db = adminDb();
    const snapshot = await db.collection("catalogProducts").get();
    const cached = snapshot.docs.map(doc => doc.data()?.product).filter(Boolean);
    if (cached.length) {
      const reference = await localFallback();
      return json(200, {
        products: mergeWithReference(reference, cached),
        mode: cached.length >= reference.length ? "firestore" : "mixed",
        refreshedAt: snapshot.docs.map(d => d.data()?.refreshedAt?.toDate?.()?.toISOString()).filter(Boolean).sort().at(-1) || null
      });
    }
    return json(200, { products: await localFallback(), mode: "fallback", warning: "Aucune synchronisation fournisseur disponible; catalogue de secours." });
  } catch (error) {
    console.error("[MyShop products] Firestore unavailable:", error.message);
    try { return json(200, { products: await localFallback(), mode: "fallback", warning: "Firestore indisponible; catalogue de secours." }); }
    catch { return json(503, { error: "Catalogue temporairement indisponible." }); }
  }
}
