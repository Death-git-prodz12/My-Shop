import { boot, card, ic, CAT, esc, updateTicker } from "../ui.js";
import { getProducts, watchLive } from "../api.js";
import { byMarginDesc } from "../pricing.js";

boot({ page: "catalogue", guard: true, render: async ({ user, app }) => {
  let products = await getProducts();
  updateTicker(products);
  const params = new URLSearchParams(location.search);
  let categories = ["all", ...new Set(products.map(product => product.category))];
  let platforms = [...new Set(products.map(product => product.platform || product.source || "Autre"))].sort((a, b) => a.localeCompare(b, "fr"));
  let category = params.get("category") || "all", query = (params.get("q") || "").trim().toLocaleLowerCase("fr"), platform = params.get("platform") || "all", sort = "featured", minMargin = 0;
  if (category !== "all" && !categories.includes(category)) category = "all";
  if (platform !== "all" && !platforms.includes(platform) && platform !== "Shopify") platform = "all";
  app.innerHTML = `<div class="sh"><div><h2 class="fd">Catalogue</h2><small>${products.length} produits · marges calculées (prix − coût) / prix, à titre estimatif</small></div><label class="glass sp">${ic("search", 18)}<input id="q" type="search" placeholder="Produit ou plateforme" autocomplete="off" value="${esc(query)}"></label></div>
    <div class="catalog-controls"><div class="rail" id="chips" aria-label="Catégories"></div>
    <div class="filter-row"><label class="filter-control"><span>Plateforme</span><select id="platform"><option value="all">Toutes les plateformes</option>${platforms.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}</select></label>
    <label class="filter-control"><span>Marge minimale</span><select id="margin"><option value="0">Toutes</option><option value="20">≥ 20 %</option><option value="30">≥ 30 %</option><option value="40">≥ 40 %</option></select></label>
    <label class="filter-control"><span>Trier par</span><select id="sort"><option value="featured">Sélection</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option><option value="profit">Marge estimée</option></select></label></div></div>
    <p class="catalog-disclaimer">Catalogue et filtres accessibles gratuitement. Les prix et coûts de démonstration doivent être confirmés auprès des vendeurs. La marge brute exclut livraison, taxes, retours et frais de plateforme.</p>
    <div class="gr" id="g"></div>`;
  const $ = id => document.getElementById(id);

  const draw = () => {
    categories = ["all", ...new Set(products.map(product => product.category))];
    platforms = [...new Set(products.map(product => product.platform || product.source || "Autre"))].sort((a, b) => a.localeCompare(b, "fr"));
    if (category !== "all" && !categories.includes(category)) category = "all";
    if (platform !== "all" && !platforms.includes(platform)) platform = "all";
    $("platform").innerHTML = `<option value="all">Toutes les plateformes</option>${platforms.map(item => `<option value="${esc(item)}">${esc(item)}</option>`).join("")}`;
    $("platform").value = platform;
    const summary = document.querySelector(".sh small");
    if (summary) summary.textContent = `${products.length} produits · marges calculées (prix − coût) / prix, à titre estimatif`;
    $("chips").innerHTML = categories.map(item => `<button class="seg ${item === category ? "on" : ""}" data-cat="${esc(item)}">${item === "all" ? "Tout" : esc(CAT[item] || CAT.divers)}</button>`).join("");
    const list = products.filter(product => (category === "all" || product.category === category)
      && (platform === "all" || (platform === "Shopify" ? (product.platform || product.source).startsWith("Shopify") : (product.platform || product.source) === platform))
      && (minMargin === 0 || (product.profitMargin ?? -Infinity) >= minMargin)
      && (`${product.title} ${product.platform} ${CAT[product.category] || CAT.divers} ${product.rawCategory}`).toLocaleLowerCase("fr").includes(query));
    if (sort === "price-asc") list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sort === "price-desc") list.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    if (sort === "profit") list.sort(byMarginDesc);
    $("g").innerHTML = list.map(product => card(product, user)).join("") || '<div class="glass empty"><h3>Aucun résultat</h3><p>Essaie d’ajuster les filtres.</p></div>';
  };
  $("chips").addEventListener("click", event => { const button = event.target.closest("[data-cat]"); if (button) { category = button.dataset.cat; draw(); } });
  $("q").addEventListener("input", event => { query = event.target.value.trim().toLocaleLowerCase("fr"); draw(); });
  $("platform").addEventListener("change", event => { platform = event.target.value; draw(); });
  $("margin").addEventListener("change", event => { minMargin = Number(event.target.value); draw(); });
  $("sort").addEventListener("change", event => { sort = event.target.value; draw(); });
  $("platform").value = platform;
  draw();
  const stopLive = watchLive(async () => {
    try { products = await getProducts(true); updateTicker(products); draw(); }
    catch (error) { console.warn("[MyShop] Actualisation du catalogue impossible.", error); }
  });
  window.addEventListener("pagehide", stopLive, { once: true });
} });
