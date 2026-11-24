import { boot, card, ic, CAT, esc, updateTicker } from "../ui.js";
import { getProducts, getCatalogMode, watchLive } from "../api.js";

boot({ page: "index", guard: true, render: async ({ user, app }) => {
  const draw = products => {
    updateTicker(products);
    const stats = [["grid", "Références suivies", products.length], ["chart", "Plateformes", new Set(products.map(product => product.platform)).size], ["mark", "Catégories", new Set(products.map(product => product.category)).size]];
    const categories = [...new Set(products.map(product => product.category))];
    const groups = categories.map(id => ({ id, items: products.filter(product => product.category === id).slice(0, 4) }));
    const mode = getCatalogMode();
    const liveReady = mode === "firestore";
    const status = liveReady ? "Dernier relevé fournisseur synchronisé" : mode === "mixed" ? "Catalogue partiellement synchronisé" : "Catalogue de référence · flux fournisseur à configurer";
    app.innerHTML = `<section class="hero"><div class="hero-copy"><span class="live ${liveReady ? "on" : ""}">${ic("info", 14)}${status}</span>
      <p class="eyebrow">LA VEILLE PRODUIT POUR LES REVENDEURS</p><h1>Les tendances utiles à votre prochain choix produit.</h1><p class="sub">Explorez les références du catalogue MyShop, comparez leur plateforme d’origine et consultez une marge estimative avant de vérifier le prix vendeur.</p>
      <a class="bt hero-cta" href="catalogue.html">Explorer le catalogue <span aria-hidden="true">→</span></a></div>
      <div class="hs">${stats.map(([icon, label, value]) => `<div class="stat-card"><span class="chip">${ic(icon, 18)}</span><span><small>${label}</small><b>${value}</b></span></div>`).join("")}</div></section>
      <div class="sh section-intro"><div><p class="eyebrow">SÉLECTION MYSHOP</p><h2>Explorez par univers</h2></div><a class="text-link" href="catalogue.html">Voir les ${products.length} produits →</a></div>
      <div class="bento-grid">${groups.map(group => `<section class="bento-card"><div class="bento-heading"><h3>${esc(CAT[group.id] || CAT.divers)}</h3><a href="catalogue.html?category=${encodeURIComponent(group.id)}">Tout voir <span aria-hidden="true">→</span></a></div><div class="mini-grid">${group.items.map(product => card(product, user)).join("")}</div></section>`).join("")}</div>
      <p class="catalog-disclaimer home-disclaimer">Les prix et coûts sont des références estimatives, pas des cotations en direct. Vérifiez l’annonce sur le site vendeur.</p>`;
  };
  draw(await getProducts());
  watchLive(async () => draw(await getProducts(true)));
} });
