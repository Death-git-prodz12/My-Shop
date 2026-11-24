import { createHmac } from "node:crypto";
import { fetchWithTimeout, recordsFrom } from "./http.js";

const timeout = Math.max(1000, Math.min(Number(process.env.PROVIDER_TIMEOUT_MS) || 6500, 6500));
const env = name => String(process.env[name] || "").trim();
const first = (...values) => values.find(v => v !== undefined && v !== null && v !== "");
const array = value => Array.isArray(value) ? value : value ? [value] : [];

function priceFromAmazon(item) {
  const listing = item?.offersV2?.listings?.[0];
  const money = listing?.price?.money ?? listing?.price;
  return { price: money?.amount, currency: money?.currency ?? "USD" };
}
function mapAmazon(item) {
  const price = priceFromAmazon(item);
  const pageUrl = item?.detailPageURL || "";
  let affiliateUrl = pageUrl;
  if (pageUrl && env("AMAZON_PARTNER_TAG")) {
    try { const u = new URL(pageUrl); u.searchParams.set("tag", env("AMAZON_PARTNER_TAG")); affiliateUrl = u.href; } catch { /* invalid provider URL is discarded later */ }
  }
  return {
    id: item?.asin ? `amazon-${String(item.asin).toLowerCase()}` : undefined,
    title: item?.itemInfo?.title?.displayValue,
    ...price,
    platform: "Amazon", sourceUrl: affiliateUrl,
    images: [item?.images?.primary?.large?.url, item?.images?.primary?.hiRes?.url, ...array(item?.images?.variants).map(v => v?.large?.url)].filter(Boolean),
    category: item?.browseNodeInfo?.browseNodes?.[0]?.displayName,
    rating: item?.customerReviews?.starRating?.value,
    stockStatus: listing?.availability?.message,
    providerUpdatedAt: new Date().toISOString()
  };
}

let amazonToken;
async function getAmazonToken() {
  if (amazonToken && amazonToken.expiresAt > Date.now() + 60000) return amazonToken.value;
  const credentialId = env("AMAZON_CREATORS_CREDENTIAL_ID");
  const credentialSecret = env("AMAZON_CREATORS_CREDENTIAL_SECRET");
  if (!credentialId || !credentialSecret || !env("AMAZON_CREATORS_VERSION")) throw new Error("Amazon Creators API credentials are not configured.");
  const region = env("AMAZON_CREATORS_REGION").toUpperCase() || "NA";
  const tokenHost = { NA: "https://api.amazon.com/auth/o2/token", EU: "https://api.amazon.co.uk/auth/o2/token", FE: "https://api.amazon.co.jp/auth/o2/token" }[region];
  if (!tokenHost) throw new Error("AMAZON_CREATORS_REGION must be NA, EU, or FE.");
  const response = await fetchWithTimeout(tokenHost, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: credentialId, client_secret: credentialSecret, scope: "creatorsapi::default" })
  }, timeout);
  if (!response.ok) throw new Error(`Amazon OAuth returned ${response.status}.`);
  const body = await response.json();
  amazonToken = { value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return amazonToken.value;
}

async function amazon() {
  const keywords = env("AMAZON_SEARCH_KEYWORDS").split("|").map(s => s.trim()).filter(Boolean);
  if (!keywords.length) return [];
  const token = await getAmazonToken();
  const marketplace = env("AMAZON_MARKETPLACE") || "www.amazon.com";
  const all = [];
  for (const keyword of keywords.slice(0, 1)) {
    const response = await fetchWithTimeout("https://creatorsapi.amazon/catalog/v1/searchItems", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", "x-marketplace": marketplace },
      body: JSON.stringify({ keywords: keyword, marketplace, partnerTag: env("AMAZON_PARTNER_TAG"), resources: ["images.primary.large", "images.variants.large", "itemInfo.title", "offersV2.listings.price", "offersV2.listings.availability", "browseNodeInfo.browseNodes", "customerReviews.starRating"] })
    }, timeout);
    if (!response.ok) throw new Error(`Amazon Creators API returned ${response.status}.`);
    const payload = await response.json();
    all.push(...(payload?.searchResult?.items || []));
  }
  return all.map(mapAmazon);
}

async function aliExpress() {
  const endpoint = env("ALIEXPRESS_ENDPOINT");
  const method = env("ALIEXPRESS_API_METHOD");
  const appKey = env("ALIEXPRESS_APP_KEY"), secret = env("ALIEXPRESS_APP_SECRET");
  if (!endpoint || !method || !appKey || !secret) return [];
  const url = new URL(endpoint);
  if (url.protocol !== "https:") throw new Error("AliExpress endpoint must use HTTPS.");
  const apiPath = env("ALIEXPRESS_API_PATH") || "/sync";
  const params = {
    app_key: appKey, method, sign_method: "sha256", timestamp: new Date().toISOString().slice(0, 19).replace("T", " "),
    ...(env("ALIEXPRESS_ACCESS_TOKEN") ? { session: env("ALIEXPRESS_ACCESS_TOKEN") } : {}),
    ...JSON.parse(env("ALIEXPRESS_REQUEST_PARAMS_JSON") || "{}")
  };
  const signBase = apiPath + Object.keys(params).sort().map(k => `${k}${params[k]}`).join("");
  params.sign = createHmac("sha256", secret).update(signBase, "utf8").digest("hex").toUpperCase();
  const response = await fetchWithTimeout(url.href, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) }, timeout);
  if (!response.ok) throw new Error(`AliExpress Open Platform returned ${response.status}.`);
  const payload = await response.json();
  const records = recordsFrom(payload);
  return records.map(r => ({
    id: r.product_id ? `aliexpress-${r.product_id}` : r.id,
    title: first(r.product_title, r.product_name, r.subject),
    price: first(r.target_sale_price, r.target_app_sale_price, r.sale_price),
    costPrice: first(r.cost_price, r.original_price),
    currency: first(r.target_sale_price_currency, r.currency, "USD"),
    platform: "AliExpress", sourceUrl: first(r.product_detail_url, r.product_url, r.detail_url),
    images: array(first(r.product_main_image_url, r.image_url, r.images)), category: first(r.category_name, r.second_level_category_name),
    stockStatus: first(r.stock_status, r.stock), salesLast7Days: first(r.sales_last_7_days, r.sales_7d)
  }));
}

async function authorizedFeed(platform, prefix) {
  const endpoint = env(`${prefix}_FEED_URL`);
  if (!endpoint) return [];
  const u = new URL(endpoint);
  if (u.protocol !== "https:" || u.username || u.password) throw new Error(`${prefix}_FEED_URL must be an HTTPS URL without embedded credentials.`);
  const token = env(`${prefix}_FEED_TOKEN`);
  const response = await fetchWithTimeout(u.href, { headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } }, timeout);
  if (!response.ok) throw new Error(`${platform} authorized feed returned ${response.status}.`);
  return recordsFrom(await response.json()).map(r => ({
    ...r, platform, title: first(r.title, r.product_title, r.product_name),
    price: first(r.price, r.sale_price, r.current_price), costPrice: first(r.costPrice, r.cost_price),
    sourceUrl: first(r.sourceUrl, r.product_url, r.detail_url),
    images: array(first(r.images, r.image_url, r.main_image)),
    category: first(r.category, r.category_name),
    stockStatus: first(r.stockStatus, r.stock_status, r.stock),
    salesLast7Days: first(r.salesLast7Days, r.sales_last_7_days, r.sales_7d)
  }));
}

// Optional no-key JSON endpoints (open data or a public seller feed). URLs are deployment config only,
// never supplied by the browser; each item must include its canonical product URL and source price.
async function publicProductFeeds() {
  const raw = env("PUBLIC_PRODUCT_FEEDS_JSON");
  if (!raw) return [];
  const feeds = JSON.parse(raw);
  if (!Array.isArray(feeds)) throw new Error("PUBLIC_PRODUCT_FEEDS_JSON must be a JSON array.");
  const jobs = feeds.slice(0, 10).map(async feed => {
    const url = new URL(feed.url);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Public feed URLs must use HTTPS and must not embed credentials.");
    const response = await fetchWithTimeout(url.href, { headers: { Accept: "application/json" } }, timeout);
    if (!response.ok) throw new Error(`Public feed returned ${response.status}.`);
    const records = recordsFrom(await response.json());
    return records.slice(0, 500).map(record => {
      const platform = first(record.platform, feed.platform, "Open Data");
      const isShopify = String(platform).toLowerCase().startsWith("shopify");
      let sourceUrl = first(record.sourceUrl, record.productUrl, record.product_url, record.url);
      if (!sourceUrl && isShopify && record.handle) sourceUrl = `${url.origin}/products/${encodeURIComponent(record.handle)}`;
      const currency = first(record.currency, feed.currency);
      if (!currency || !sourceUrl || !first(record.title, record.name, record.product_title, record.product_name)) return null;
      return {
        ...record, platform,
        title: first(record.title, record.name, record.product_title, record.product_name),
        price: first(record.price, record.current_price, record.sale_price, record.variants?.[0]?.price),
        costPrice: first(record.costPrice, record.cost_price),
        sourceUrl,
        images: array(first(record.images?.map?.(image => image?.src || image?.url || image), record.images, record.image, record.image_url, record.main_image)),
        category: first(record.category, record.category_name, record.product_type, record.type),
        stockStatus: first(record.stockStatus, record.stock_status, record.stock),
        salesLast7Days: first(record.salesLast7Days, record.sales_last_7_days, record.sales_7d),
        currency
      };
    }).filter(Boolean);
  });
  const results = await Promise.allSettled(jobs);
  results.forEach((result, index) => { if (result.status === "rejected") console.warn(`[MyShop sync] Public feed ${index + 1}:`, result.reason?.message); });
  return results.flatMap(result => result.status === "fulfilled" ? result.value : []);
}

// Shopify's public Ajax Product API returns storefront-visible product data without an API key.
async function shopifyPublicProducts() {
  const raw = env("SHOPIFY_PUBLIC_PRODUCT_URLS");
  if (!raw) return [];
  const urls = JSON.parse(raw);
  if (!Array.isArray(urls)) throw new Error("SHOPIFY_PUBLIC_PRODUCT_URLS must be a JSON array of product URLs.");
  const results = await Promise.allSettled(urls.slice(0, 10).map(async entry => {
    const original = typeof entry === "string" ? { url: entry } : entry;
    const page = new URL(original.url);
    if (page.protocol !== "https:" || page.username || page.password) throw new Error("Shopify product URLs must use HTTPS and not embed credentials.");
    const match = page.pathname.match(/^(.*)\/products\/([^/]+)\/?$/);
    if (!match) throw new Error("Shopify URL must match /products/{handle}.");
    const endpoint = new URL(`${match[1]}/products/${encodeURIComponent(match[2])}.js`, page.origin);
    const cartEndpoint = new URL(`${match[1]}/cart.js`, page.origin);
    const [response, cartResponse] = await Promise.all([
      fetchWithTimeout(endpoint.href, { headers: { Accept: "application/json" } }, timeout),
      original.currency || env("SHOPIFY_PUBLIC_CURRENCY") ? Promise.resolve(null) : fetchWithTimeout(cartEndpoint.href, { headers: { Accept: "application/json" } }, timeout)
    ]);
    if (!response.ok) throw new Error(`Shopify Ajax API returned ${response.status}.`);
    const product = await response.json();
    const money = Number(product.price ?? product.variants?.[0]?.price);
    if (!Number.isFinite(money)) throw new Error("Shopify response has no valid product price.");
    const cart = cartResponse?.ok ? await cartResponse.json() : null;
    const currency = original.currency || env("SHOPIFY_PUBLIC_CURRENCY") || cart?.currency;
    if (!currency) throw new Error("Shopify currency unavailable; set SHOPIFY_PUBLIC_CURRENCY for this store.");
    const images = array(product.images || product.featured_image).map(src => String(src).startsWith("//") ? `https:${src}` : src);
    return {
      id: `shopify-${product.id || product.handle || match[2]}`,
      title: product.title, price: money / 100, currency,
      platform: "Shopify", sourceUrl: page.href, images,
      category: first(product.type, product.product_type, product.tags?.[0]),
      stockStatus: product.available ? "Available" : "Unavailable",
      providerUpdatedAt: new Date().toISOString()
    };
  }));
  results.forEach((result, index) => { if (result.status === "rejected") console.warn(`[MyShop sync] Shopify public product ${index + 1}:`, result.reason?.message); });
  return results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
}

export async function collectProviderProducts() {
  const jobs = [
    ["Amazon", amazon], ["AliExpress", aliExpress], ["Temu", () => authorizedFeed("Temu", "TEMU")],
    ["Shein", () => authorizedFeed("Shein", "SHEIN")], ["Alibaba", () => authorizedFeed("Alibaba", "ALIBABA")],
    ["Shopify", () => authorizedFeed("Shopify", "SHOPIFY")], ["TikTok Shop", () => authorizedFeed("TikTok Shop", "TIKTOK")],
    ["CJ Dropshipping", () => authorizedFeed("CJ Dropshipping", "CJ")],
    ["Shopify Ajax (sans clé)", shopifyPublicProducts], ["Open Data (sans clé)", publicProductFeeds]
  ];
  const results = await Promise.all(jobs.map(async ([name, run]) => {
    try { return { name, products: await run(), error: null }; }
    catch (error) { console.warn(`[MyShop sync] ${name}:`, error.message); return { name, products: [], error: error.message }; }
  }));
  return { products: results.flatMap(r => r.products), providers: results.map(({ name, products, error }) => ({ name, count: products.length, error })) };
}
