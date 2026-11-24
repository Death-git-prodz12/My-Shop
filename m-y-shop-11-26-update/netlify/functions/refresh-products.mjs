import { normalizeProduct } from "../../js/ingest.js";
import { adminDb } from "./_lib/firebase-admin.js";
import { collectProviderProducts } from "./_lib/providers.js";

export const config = { schedule: "*/15 * * * *" };

const stripUndefined = value => {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, stripUndefined(v)]));
  }
  return value;
};
const docId = id => Buffer.from(String(id)).toString("base64url");

export default async function handler() {
  // Scheduled functions run on Netlify's scheduler and don't accept incoming HTTP requests.
  const { products, providers } = await collectProviderProducts();
  if (!products.length) {
    console.info("[MyShop sync] No provider products; keeping existing Firestore snapshots.", providers);
    return new Response(JSON.stringify({ updated: 0, providers }), { headers: { "content-type": "application/json" } });
  }
  const db = adminDb();
  const unique = new Map();
  for (const raw of products) {
    const product = normalizeProduct({ ...raw, dataMode: "live" });
    if (!unique.has(product.id)) unique.set(product.id, product);
  }
  const normalized = [...unique.values()].slice(0, 400);
  const batches = [];
  for (let i = 0; i < normalized.length; i += 400) batches.push(normalized.slice(i, i + 400));
  for (const group of batches) {
    const batch = db.batch();
    const now = new Date();
    const refs = group.map(product => db.collection("catalogProducts").doc(docId(product.id)));
    const oldSnapshots = await db.getAll(...refs);
    for (let index = 0; index < group.length; index++) {
      const product = group[index], ref = refs[index], old = oldSnapshots[index];
      const oldHistory = old.data()?.priceHistory || [];
      const history = [...oldHistory, ...(product.price == null ? [] : [{ at: now.toISOString(), price: product.price, currency: product.currency }])].slice(-90);
      const record = stripUndefined({
        product: { ...product, priceHistory: history }, priceHistory: history,
        stockStatus: product.stockStatus, salesLast7Days: product.salesLast7Days,
        refreshedAt: now, sourceUpdatedAt: product.providerUpdatedAt || now.toISOString()
      });
      batch.set(ref, record, { merge: true });
    }
    await batch.commit();
  }
  console.info(`[MyShop sync] Updated ${normalized.length} products.`, providers);
  return new Response(JSON.stringify({ updated: normalized.length, providers }), { headers: { "content-type": "application/json" } });
}
