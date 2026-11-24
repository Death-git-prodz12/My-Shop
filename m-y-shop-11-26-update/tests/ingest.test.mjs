// Lancer : node --test   (depuis la racine du projet)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { computeProfitMargin, computeProfitAmount, parseAmount, marginTier } from "../js/pricing.js";
import { resolveCategory, FALLBACK_CATEGORY, CAT } from "../js/categories.js";
import { normalizeProduct, ingestWithReport, INGESTION_SOURCES } from "../js/ingest.js";

test("marge = (prix − coût) / prix × 100", () => {
  assert.equal(computeProfitMargin(29.99, 18), 40);
  assert.equal(computeProfitMargin("45,00 €", "27"), 40);
  assert.equal(computeProfitMargin(100, 125), -25);          // vente à perte conservée
  assert.equal(computeProfitMargin(null, 5), null);          // jamais de marge inventée
  assert.equal(computeProfitMargin(0, 0), null);
  assert.equal(computeProfitAmount(29.99, 18), 11.99);
  assert.equal(marginTier(40), "high"); assert.equal(marginTier(25), "mid"); assert.equal(marginTier(5), "low"); assert.equal(marginTier(-1), "loss"); assert.equal(marginTier(null), "unknown");
});

test("lecture des montants", () => {
  assert.equal(parseAmount("1 299,00 €"), 1299); assert.equal(parseAmount("1,299.50"), 1299.5);
  assert.equal(parseAmount("12.34 -- 15.00"), 12.34); assert.equal(parseAmount(""), null); assert.equal(parseAmount(-3), null);
});

test("catégorie inconnue → Undefined / Divers, valeur d'origine conservée", () => {
  const r = resolveCategory({ category: "Musical Instruments", title: "Ukulélé" });
  assert.deepEqual([r.id, r.via, r.raw], [FALLBACK_CATEGORY, "fallback", "Musical Instruments"]);
  assert.equal(CAT[FALLBACK_CATEGORY], "Undefined / Divers");
  assert.equal(resolveCategory({ category: "Skin Care" }).id, "beaute");
  assert.equal(resolveCategory({ category: "Electronics > VR" }).id, "gadgets");
  assert.equal(resolveCategory({ category: "", title: "water bottle tumbler" }).id, "maison");
  assert.equal(resolveCategory({}).id, FALLBACK_CATEGORY);
});

test("schéma canonique complet", () => {
  const p = normalizeProduct({ title: "Test", price: "20", costPrice: 8, platform: "temu", sourceUrl: "https://x.example/p", rating: 4.5, images: ["https://x.example/i.jpg"], category: "Pets" });
  for (const k of ["id", "title", "price", "costPrice", "profitMargin", "platform", "sourceUrl", "category", "rating", "images"]) assert.ok(k in p, k);
  assert.equal(p.platform, "Temu"); assert.equal(p.profitMargin, 60); assert.equal(p.category, "animaux");
  assert.ok(!("isPremium" in p));
});

test("normalizeProduct est idempotent", () => {
  const once = normalizeProduct({ title: "Zed", price: 30, costPrice: 10, category: "inconnue" });
  assert.deepEqual(normalizeProduct(once), once);
  assert.equal(once.rawCategory, "inconnue"); assert.equal(once.category, FALLBACK_CATEGORY);
});

test("la marge déclarée incohérente est recalculée", () => {
  const p = normalizeProduct({ title: "A", price: 100, costPrice: 50, profitMargin: 90 });
  assert.equal(p.profitMargin, 50); assert.equal(p.declaredMargin, 90); assert.equal(p.marginSource, "computed");
  const q = normalizeProduct({ title: "B", profitMargin: 33.3 });
  assert.equal(q.profitMargin, 33.3); assert.equal(q.marginSource, "declared");
  assert.equal(normalizeProduct({ title: "C" }).profitMargin, null);
});

test("adaptateurs de plateformes", () => {
  const shopify = normalizeProduct({ title: "Mug", handle: "mug", product_type: "Kitchen", tags: "gift, home", variants: [{ price: "19.90" }], images: [{ src: "https://cdn.example/m.jpg" }] }, { source: "Shopify", origin: "https://shop.example" });
  assert.equal(shopify.platform, "Shopify"); assert.equal(shopify.price, 19.9); assert.equal(shopify.sourceUrl, "https://shop.example/products/mug"); assert.equal(shopify.category, "maison");
  const ali = normalizeProduct({ product_title: "Lampe", target_sale_price: "12.50", product_detail_url: "https://www.aliexpress.com/item/1.html", evaluate_rate: "94.0%", first_level_category_name: "Lights & Lighting", platform: "AliExpress" });
  assert.equal(ali.price, 12.5); assert.equal(ali.rating, 4.7);
  const amz = normalizeProduct({ ASIN: "B000TEST", ItemInfo: { Title: { DisplayValue: "Bouilloire" } }, Offers: { Listings: [{ Price: { Amount: 39.9, Currency: "EUR" } }] }, DetailPageURL: "https://www.amazon.fr/dp/B000TEST", platform: "Amazon" });
  assert.equal(amz.id, "amazon-b000test"); assert.equal(amz.currency, "EUR"); assert.equal(amz.title, "Bouilloire");
  const cj = normalizeProduct({ pid: "123", productNameEn: "Gadget", sellPrice: "4.20 -- 6.00", platform: "CJ Dropshipping" });
  assert.equal(cj.costPrice, 4.2); assert.equal(cj.price, null); assert.equal(cj.profitMargin, null);   // prix fournisseur = coût, jamais prix de vente
});

test("0 % de perte : aucune catégorie inconnue n'écarte un produit", () => {
  const { products, report } = ingestWithReport([
    { id: "a", title: "A", category: "xyz" }, { id: "b", title: "B", category: "Pets" }, { id: "a", title: "dup" }, null, "nope"
  ], "Temu");
  assert.equal(products.length, 2); assert.equal(report.categoryFallback, 1); assert.equal(report.duplicates, 1); assert.equal(report.invalid, 2);
  assert.equal(report.fallbackItems[0].rawCategory, "xyz");
  assert.throws(() => ingestWithReport({}), TypeError);
});

test("catalogue local : tous les produits sont conservés", () => {
  const file = JSON.parse(readFileSync(new URL("../data/products.json", import.meta.url), "utf8"));
  const { products, report } = ingestWithReport(file.products);
  assert.equal(products.length, file.products.length);
  assert.equal(report.duplicates, 0);
  for (const p of products) { assert.ok(INGESTION_SOURCES.includes(p.platform) || p.platform.startsWith("Shopify"), p.platform); assert.ok(p.category in CAT); }
  assert.ok(products.some(p => p.category === FALLBACK_CATEGORY), "au moins un produit de démonstration illustre le repli");
  assert.ok(products.every(p => !("isPremium" in p)));
  assert.equal(products.find(p => p.id === "owala-freesip-24").profitMargin, 40);
  assert.equal(products.find(p => p.id === "galaxy-projector").profitMargin, null);   // pas de coût → pas de marge inventée
});
