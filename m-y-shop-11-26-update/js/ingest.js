// Ingestion multi-sources : modèle canonique, adaptateurs par plateforme, repli « Undefined / Divers ».
// Module pur (pas de réseau, pas de Firebase) : testable sous Node avec `node --test tests/`.
import { resolveCategory } from "./categories.js";
import { parseAmount, computeProfitMargin, computeProfitAmount, marginTier } from "./pricing.js";

export const INGESTION_SOURCES = Object.freeze([
  "Amazon", "AliExpress", "Temu", "Shopify", "TikTok Shop", "Shein", "Alibaba", "CJ Dropshipping"
]);

const PLATFORM_ALIASES = new Map([
  ["amazon", "Amazon"], ["aliexpress", "AliExpress"], ["temu", "Temu"],
  ["shopify", "Shopify"], ["tiktok shop", "TikTok Shop"], ["tiktok", "TikTok Shop"],
  ["shein", "Shein"], ["alibaba", "Alibaba"], ["cj dropshipping", "CJ Dropshipping"]
]);

/** Nom canonique de la plateforme (« Shopify (boutique Stanley) » → « Shopify ») pour choisir l'adaptateur. */
const canonicalPlatform = name => {
  const s = String(name || "").toLowerCase();
  for (const [alias, canon] of PLATFORM_ALIASES) if (s === alias || s.startsWith(alias + " ") || s.startsWith(alias + "(")) return canon;
  return null;
};

const safeHttpUrl = value => {
  try { const u = new URL(value); return u.protocol === "https:" ? u.href : ""; } catch { return ""; }
};
const defined = obj => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && !v.length)));
const first = (...v) => v.find(x => x !== undefined && x !== null && x !== "");
const slug = s => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* ---------- Adaptateurs : traduisent le vocabulaire d'une plateforme vers le modèle canonique ----------
   Les champs Shopify (products.json), AliExpress (Open Platform), Amazon Creators API et TikTok Shop (Partner API)
   suivent leur documentation publique ; Temu, Shein et Alibaba passent par l'adaptateur générique (alias courants).
   À valider avec vos vrais flux avant production. Un champ déjà canonique n'est jamais écrasé. */
const GENERIC = r => defined({
  title: first(r.product_title, r.product_name, r.productNameEn, r.goods_name, r.subject),
  price: first(r.sale_price, r.current_price, r.min_price, r.target_sale_price),
  sourceUrl: first(r.product_url, r.detail_url, r.product_detail_url),
  images: Array.isArray(r.images) ? undefined : first(r.image_urls, [first(r.image_url, r.main_image, r.thumbnail, r.productImage)].filter(Boolean)),
  category: first(r.category_name, r.categoryName, r.product_type, r.first_level_category_name),
  rating: first(r.star_rating, r.avg_rating),
  reviews: first(r.review_count, r.reviews_count, r.ratings_count)
});

const ADAPTERS = {
  Shopify: (r, ctx) => defined({
    title: r.title,
    price: r.variants?.[0]?.price,
    category: r.product_type,
    tags: r.tags,
    images: Array.isArray(r.images) ? r.images.map(i => i?.src ?? i) : undefined,
    sourceUrl: r.handle && ctx.origin ? `${String(ctx.origin).replace(/\/$/, "")}/products/${r.handle}` : undefined
  }),
  AliExpress: r => defined({
    title: r.product_title,
    price: first(r.target_sale_price, r.target_app_sale_price),
    currency: r.target_sale_price_currency,
    sourceUrl: r.product_detail_url,
    images: [r.product_main_image_url, ...[].concat(r.product_small_image_urls?.string ?? r.product_small_image_urls ?? [])].filter(Boolean),
    category: first(r.second_level_category_name, r.first_level_category_name),
      costPrice: first(r.cost_price, r.original_price),
      stockStatus: first(r.stock_status, r.stock),
      salesLast7Days: first(r.sales_last_7_days, r.sales_7d),
    rating: r.evaluate_rate ? +(parseAmount(r.evaluate_rate) / 20).toFixed(1) : undefined // « 94.0% » → 4,7 / 5
  }),
  Amazon: r => {
    const offer = r.Offers?.Listings?.[0]?.Price, node = r.BrowseNodeInfo?.BrowseNodes?.[0];
    return defined({
      id: r.ASIN ? `amazon-${String(r.ASIN).toLowerCase()}` : undefined,
      title: r.ItemInfo?.Title?.DisplayValue,
      price: offer?.Amount, currency: offer?.Currency,
      sourceUrl: r.DetailPageURL,
      images: [r.Images?.Primary?.Large?.URL, ...(r.Images?.Variants ?? []).map(v => v?.Large?.URL)].filter(Boolean),
      stockStatus: first(r.OffersV2?.Listings?.[0]?.Availability?.Message, r.stockStatus),
      category: first(node?.ContextFreeName, node?.DisplayName),
      rating: r.CustomerReviews?.StarRating?.Value, reviews: r.CustomerReviews?.Count
    });
  },
  "TikTok Shop": r => {
    const price = r.skus?.[0]?.price, chain = r.category_chains?.[r.category_chains.length - 1];
    return defined({
      title: first(r.title, r.product_name),
      price: first(price?.sale_price, price?.original_price), currency: price?.currency,
      images: Array.isArray(r.main_images) ? r.main_images.flatMap(i => i?.urls ?? []) : undefined,
      category: first(chain?.local_name, chain?.name)
    });
  },
  // Chez un fournisseur (CJ), « sellPrice » est le prix d'achat, donc le COÛT : jamais le prix de vente.
  "CJ Dropshipping": r => defined({
    id: r.pid ? `cj-${r.pid}` : undefined,
    title: first(r.productNameEn, r.productName),
    costPrice: r.sellPrice,
    images: r.productImage ? [r.productImage] : undefined,
    category: r.categoryName
  })
};

function mapRecord(raw, platform, ctx) {
  const canon = canonicalPlatform(platform);
  const mapped = { ...GENERIC(raw), ...(canon && ADAPTERS[canon] ? ADAPTERS[canon](raw, ctx) : {}) };
  return { ...mapped, ...defined(raw) }; // les champs déjà canoniques gagnent
}

/**
 * Modèle canonique d'un produit (idempotent : normalizeProduct(normalizeProduct(x)) donne le même résultat).
 * Les noms historiques (name, source, url, priceRef, image) restent disponibles pour les anciennes pages.
 */
export function normalizeProduct(input = {}, ctx = {}) {
  const platformRaw = String(input.platform ?? input.source ?? ctx.source ?? "Autre").trim() || "Autre";
  const platform = PLATFORM_ALIASES.get(platformRaw.toLowerCase()) || platformRaw;
  const raw = mapRecord(input, platformRaw, ctx);
  const productFields = Object.fromEntries(Object.entries(raw).filter(([key]) => !["isPremium", "premiumSource", "premiumReasons"].includes(key)));

  const title = String(raw.title ?? raw.name ?? "Produit sans titre").trim() || "Produit sans titre";
  const price = parseAmount(first(raw.price, raw.priceRef));
  const costPrice = parseAmount(raw.costPrice);
  const profitAmount = computeProfitAmount(price, costPrice);

  // Marge : recalculée dès que prix ET coût sont connus (source de vérité) ; sinon valeur déclarée ; sinon aucune.
  const computed = computeProfitMargin(price, costPrice);
  const declaredRaw = raw.profitMargin === "" || raw.profitMargin == null ? NaN : Number(raw.profitMargin);
  const declared = Number.isFinite(declaredRaw) ? Math.round(declaredRaw * 10) / 10 : null;
  const profitMargin = computed ?? declared;
  const marginSource = computed !== null ? "computed" : declared !== null ? "declared" : null;

  const rawCategory = String(raw.rawCategory ?? raw.category ?? "").trim();
  const cat = resolveCategory({ category: rawCategory, tags: raw.tags, breadcrumbs: raw.breadcrumbs, title });

  const rating = parseAmount(raw.rating), reviews = parseAmount(raw.reviews);
  const currency = String(raw.currency || "USD").toUpperCase();

  const sourceUrl = safeHttpUrl(first(raw.sourceUrl, raw.url, raw.link));
  const images = (Array.isArray(raw.images) ? raw.images : [raw.image]).map(safeHttpUrl).filter(Boolean);

  return {
    ...productFields,
    id: String(raw.id ?? slug(`${platform}-${title}`)),
    title, name: title,
    price, priceRef: price,
    costPrice, profitAmount, profitMargin, marginSource, marginTier: marginTier(profitMargin),
    ...(declared !== null && computed !== null && Math.abs(declared - computed) > 0.5 ? { declaredMargin: declared } : {}),
    platform, source: platform,
    sourceUrl, url: sourceUrl,
    linkType: raw.linkType || "product",
    category: cat.id, rawCategory: cat.raw, categoryVia: cat.via,
    rating, reviews,
    stockStatus: raw.stockStatus == null ? undefined : String(raw.stockStatus),
    salesLast7Days: Number.isFinite(Number(raw.salesLast7Days)) ? Number(raw.salesLast7Days) : undefined,
    images, image: images[0] || "",
    currency,
    note: String(raw.note || ""),
    priceCheckedAt: first(raw.priceCheckedAt, raw.providerUpdatedAt, null),
    dataMode: raw.dataMode || "live"
  };
}

/**
 * Importe une liste de produits issus d'une API / d'un flux autorisé.
 * Aucun produit n'est écarté pour une catégorie inconnue (repli « Undefined / Divers ») : seuls les doublons d'identifiant
 * et les entrées qui ne sont pas des objets sont ignorés, et le rapport les compte.
 */
export function ingestWithReport(records, source = "Autre", ctx = {}) {
  if (!Array.isArray(records)) throw new TypeError("La source doit fournir une liste de produits.");
  const seen = new Set();
  const report = { received: records.length, kept: 0, duplicates: 0, invalid: 0, categoryByKeyword: 0, categoryFallback: 0, byPlatform: {}, fallbackItems: [] };
  const products = [];
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)) { report.invalid++; continue; }
    const p = normalizeProduct({ ...record, platform: record.platform || record.source || source }, { ...ctx, source });
    if (seen.has(p.id)) { report.duplicates++; continue; }
    seen.add(p.id); products.push(p);
    report.kept++;
    report.byPlatform[p.platform] = (report.byPlatform[p.platform] || 0) + 1;
    if (p.categoryVia === "keyword") report.categoryByKeyword++;
    if (p.categoryVia === "fallback") {
      report.categoryFallback++;
      if (report.fallbackItems.length < 50) report.fallbackItems.push({ id: p.id, title: p.title, rawCategory: p.rawCategory });
    }
  }
  return { products, report };
}

export const ingestProducts = (records, source = "Autre", ctx = {}) => ingestWithReport(records, source, ctx).products;
