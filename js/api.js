import { CONFIG } from "./config.js";
import { getApiAuthHeaders } from "./firebase.js";
import { normalizeProduct, ingestProducts, ingestWithReport, INGESTION_SOURCES } from "./ingest.js";
import { computeProfitMargin } from "./pricing.js";
import { resolveCategory, FALLBACK_CATEGORY } from "./categories.js";

// Le modèle canonique, les adaptateurs par plateforme, la marge et le repli « Undefined / Divers » vivent dans
// ingest.js / pricing.js / categories.js (modules purs). api.js garde la couche réseau et réexporte l'ensemble.
export { normalizeProduct, ingestProducts, ingestWithReport, INGESTION_SOURCES, computeProfitMargin, resolveCategory, FALLBACK_CATEGORY };

let cache = null;
let loadedAt = 0;
let lastReport = null;
let catalogMode = "reference";
export const getIngestionReport = () => lastReport;
export const getCatalogMode = () => catalogMode;

function unwrap(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.products)) return payload.products;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal, headers: { Accept: "application/json", ...options.headers } });
  } finally { clearTimeout(timeout); }
  if (!response.ok) throw new Error(`API ${response.status} (${url})`);
  return response.json();
}

function logReport(r) {
  if (r.categoryFallback) console.info(`[MyShop] ${r.categoryFallback} produit(s) sans catégorie reconnue classé(s) « Undefined / Divers » (0 perte de données).`, r.fallbackItems);
  if (r.duplicates || r.invalid) console.warn(`[MyShop] Ingestion : ${r.duplicates} doublon(s), ${r.invalid} entrée(s) invalide(s) ignorée(s).`);
}

export async function getProducts(force = false) {
  if (cache && !force && Date.now() - loadedAt < (CONFIG.CACHE_MS || 30000)) return cache;
  if (CONFIG.API_BASE) {
    try {
      const headers = await getApiAuthHeaders();
      const remote = await fetchJson(`${CONFIG.API_BASE.replace(/\/$/, "")}/products`, { headers });
      const { products, report } = ingestWithReport(unwrap(remote));
      if (products.length) { cache = products; catalogMode = remote.mode || "firestore"; lastReport = report; loadedAt = Date.now(); logReport(report); return cache; }
      console.warn("[MyShop] API distante vide ou données invalides; repli sur le catalogue local.");
    } catch (error) {
      console.warn("[MyShop] API indisponible; repli sur data/products.json.", error);
    }
  }
  const local = await fetchJson("data/products.json");
  const { products, report } = ingestWithReport(unwrap(local));
  cache = products; catalogMode = "reference"; lastReport = report; loadedAt = Date.now();
  logReport(report);
  return cache;
}

export const getProduct = async (id, force = false) => (await getProducts(force)).find(p => p.id === id);

export async function getHistory(id) {
  const base = CONFIG.API_BASE?.replace(/\/$/, "");
  if (base) {
    try {
      const headers = await getApiAuthHeaders();
      const result = await fetchJson(`${base}/products/${encodeURIComponent(id)}/history`, { headers });
      return Array.isArray(result) ? result : (Array.isArray(result?.history) ? result.history : unwrap(result));
    } catch (error) { console.warn("[MyShop] Historique indisponible.", error); }
  }
  const data = await getProducts();
  return data.find(p => p.id === id)?.priceHistory || [];
}

export async function getCompetitors(id) {
  const base = CONFIG.API_BASE?.replace(/\/$/, "");
  if (!base) return [];
  try {
    const headers = await getApiAuthHeaders();
    const result = await fetchJson(`${base}/products/${encodeURIComponent(id)}/competitors`, { headers });
    return unwrap(result).map(item => normalizeProduct(item));
  } catch (error) { console.warn("[MyShop] Comparaison concurrente indisponible.", error); return []; }
}

export function watchLive(cb) {
  if (CONFIG.STREAM_URL && "EventSource" in window) {
    const es = new EventSource(CONFIG.STREAM_URL);
    es.onmessage = () => cb();
    es.onerror = () => console.warn("[MyShop] Flux direct interrompu; reconnexion automatique du navigateur.");
    return () => es.close();
  }
  if (CONFIG.API_BASE) {
    const timer = setInterval(() => cb(), CONFIG.REFRESH_MS || 60000);
    return () => clearInterval(timer);
  }
  return () => {};
}
