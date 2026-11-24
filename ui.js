import { authReady, onUser, currentUser } from "./firebase.js";
import { isWatched, toggleWatch, loadWatchList, subscribeWatchList, watchList } from "./store.js";
import { MAX_WATCHED_PRODUCTS } from "./watch-policy.js";
import { CAT, FALLBACK_CATEGORY } from "./categories.js";
import { formatPercent } from "./pricing.js";
import { CONFIG } from "./config.js";
import { getProducts } from "./api.js";

export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const safeUrl = u => /^https:\/\//i.test(u || "") ? u : "#";
export const ic = (n, s = 18) => `<svg class="i" width="${s}" height="${s}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
export { CAT, FALLBACK_CATEGORY };
export const catLabel = p => CAT[p?.category] || CAT[FALLBACK_CATEGORY];
export const curPage = () => (location.pathname.split("/").pop() || "index.html") + location.search;
export const price = p => {
  const n = p.price ?? p.priceRef;
  return n != null && Number.isFinite(Number(n))
    ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: p.currency || "USD" }).format(Number(n))
    : "Prix sur la plateforme";
};
export const extLabel = p => p.linkType === "product" ? "Voir la fiche sur " + p.source : "Rechercher sur " + p.source;


const money2 = (n, currency) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: currency || "USD" }).format(Number(n));
const MARGIN_LABEL = { high: "Marge élevée", mid: "Marge correcte", low: "Marge faible", loss: "Vente à perte", unknown: "Marge à confirmer" };

/** Pastille de marge : toujours visible. Sans coût connu, elle l'indique au lieu d'inventer un chiffre. */
export const marginChip = (p, extra = "") => {
  const tier = p.marginTier || "unknown";
  const known = Number.isFinite(p.profitMargin);
  const sim = known && (p.costMode === "simulation" || p.dataMode === "demo") ? " · simulation" : "";
  const label = known ? `Marge ${formatPercent(p.profitMargin)}` : MARGIN_LABEL.unknown;
  const tip = known ? `${MARGIN_LABEL[tier]} : (prix − coût) / prix × 100${sim}` : "Renseignez le coût fournisseur pour calculer la marge";
  return `<span class="margin-chip tier-${tier} ${extra}" title="${esc(tip)}">${ic("trend", 12)}${esc(label)}</span>`;
};

const S = (id, b) => `<symbol id="i-${id}" viewBox="0 0 24 24">${b}</symbol>`;
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${[
  S("home", '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  S("grid", '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  S("mark", '<path d="M6 3h12v18l-6-4-6 4z"/>'),
  S("user", '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  S("chart", '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-6"/>'),
  S("ext", '<path d="M7 17 17 7M8 7h9v9"/>'),
  S("lock", '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  S("info", '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>'),
  S("back", '<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  S("out", '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  S("search", '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  S("check", '<path d="m5 12 5 5L20 7"/>'),
  S("trend", '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  S("bell", '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>')
].join("")}</defs></svg>`;
const BAG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V7a3 3 0 0 1 6 0v1"/></svg>';
const NAV = [["index", "home", "Accueil"], ["catalogue", "grid", "Catalogue"], ["surveillance", "mark", "Surveillance"]];
const CATEGORY_LINKS = [["maison", "Maison et déco"], ["gadgets", "Gadgets & Tech"], ["beaute", "Beauté & soins"], ["mode", "Mode & accessoires"], ["sport", "Sport & fitness"], ["animaux", "Animaux"], ["tendances", "Tendances"], [FALLBACK_CATEGORY, "Undefined / Divers"]];
const PLATFORM_LINKS = ["Amazon", "AliExpress", "Temu", "Alibaba", "Shein", "TikTok Shop", "Shopify", "CJ Dropshipping"];

const hue = id => [...id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
const ini = n => n.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

export function card(p, user) {
  const title = p.title || p.name, platform = p.platform || p.source || "Autre";
  const w = isWatched(user, p.id), href = "produit.html?id=" + encodeURIComponent(p.id);
  const image = p.images?.[0] || p.image;
  const img = image ? `<img src="${esc(safeUrl(image))}" alt="${esc(title)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
  const external = p.sourceUrl ? `<a class="ib sm" href="${esc(safeUrl(p.sourceUrl))}" target="_blank" rel="noopener noreferrer" data-ext data-tip="${esc(extLabel(p))}" aria-label="${esc(extLabel(p))}">${ic("ext", 16)}</a>` : `<span class="ib sm disabled" title="Lien externe indisponible" aria-label="Lien externe indisponible">${ic("ext", 16)}</span>`;
  const margin = p.profitAmount != null ? `<small class="profit-tag">Bénéfice brut ≈ ${esc(money2(p.profitAmount, p.currency))} / unité</small>` : "";
  return `<article class="glass card"><a class="tile" href="${href}" data-go style="--h:${hue(p.id)}" aria-label="Découvrir ${esc(title)}">${img}<b>${esc(ini(title))}</b><span class="tg">${esc(platform)}</span>${marginChip(p, "on-tile")}</a>
<div><h3 class="fd"><a href="${href}" data-go>${esc(title)}</a></h3><small>${esc(catLabel(p))}</small></div>
<div class="row"><div><div class="px">${esc(price(p))}</div><small>${p.linkType === "product" ? "Fiche directe" : "Lien de recherche"}${p.costPrice != null ? ` · Coût ${new Intl.NumberFormat("fr-FR", { style: "currency", currency: p.currency || "USD" }).format(p.costPrice)}` : ""}</small>${margin}</div>
<div class="acts"><a class="ib sm" href="${href}" data-go data-tip="Analyser" aria-label="Analyser">${ic("chart", 16)}</a>
${external}
<button class="ib sm ${w ? "on" : ""}" data-watch="${esc(p.id)}" data-tip="Surveiller" aria-label="Surveiller" aria-pressed="${w}">${ic("mark", 16)}</button></div></div></article>`;
}

export const empty = (i, t, x, href, l) => `<div class="glass empty">${ic(i, 32)}<div class="fd">${esc(t)}</div><p>${esc(x)}</p>${href ? `<a class="bt" href="${href}">${esc(l)}</a>` : ""}</div>`;

export function lineChart(v) {
  const a = Math.min(...v), b = Math.max(...v), r = b - a || 1;
  const p = v.map((x, i) => `${(i / (v.length - 1) * 200).toFixed(1)},${(29 - (x - a) / r * 26).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 200 32" preserveAspectRatio="none" style="width:100%;height:280px;display:block" role="img" aria-label="Historique des prix"><polyline points="${p}" fill="none" stroke="#7DD3FC" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

let USER = null;
export const toLogin = (next, reason) => { location.href = "connexion.html?next=" + encodeURIComponent(next) + "&reason=" + reason; };
function clearBrowserSession() {
  try { localStorage.clear(); } catch {}
  try { sessionStorage.clear(); } catch {}
}

function layout(active) {
  const nav = items => items.map(([p, i, l]) => `<a class="dock-link ${p === active ? "on" : ""}" href="${p}.html" aria-label="${l}">${ic(i, 20)}<span>${l}</span></a>`).join("");
  const categoryItems = CATEGORY_LINKS.map(([id, label]) => `<a href="catalogue.html?category=${encodeURIComponent(id)}">${esc(label)}</a>`).join("");
  const platformItems = PLATFORM_LINKS.map(name => `<a href="catalogue.html?platform=${encodeURIComponent(name)}">${esc(name)}</a>`).join("");
  const support = CONFIG.SUPPORT_EMAIL;
  document.body.dataset.theme = "light";
  document.body.insertAdjacentHTML("afterbegin", SPRITE +
    `<header class="site-header"><div class="header-main"><a class="brand-logo" href="index.html" aria-label="MyShop, accueil"><img class="myshop-logo" src="assets/MyShop-transparent.png" alt="MyShop"></a>
    <form class="header-search" action="catalogue.html" role="search"><input type="search" name="q" placeholder="Rechercher un produit, une tendance…" aria-label="Rechercher dans le catalogue"><button type="submit" aria-label="Rechercher">${ic("search", 20)}</button></form>
    <div class="header-actions"><a class="header-action" id="acc" href="connexion.html">${ic("user", 20)}<span>Profil</span></a><a class="header-action" href="surveillance.html">${ic("bell", 20)}<span>Alertes</span></a><a class="header-action watch-action" href="surveillance.html">${ic("mark", 20)}<span>Surveillance</span><b class="watch-count">0/${MAX_WATCHED_PRODUCTS}</b></a></div></div>
    <nav class="subnav"><details class="category-menu"><summary>${ic("grid", 17)}Toutes les catégories</summary><div class="category-popover">${categoryItems}</div></details><div class="platform-shortcuts" aria-label="Filtrer par plateforme">${platformItems}</div></nav></header>
    <section class="live-ticker" aria-label="Tendances du catalogue"><span class="ticker-label">TENDANCES</span><div class="ticker-window"><div class="ticker-track" id="ticker-track"></div></div></section>
    <main id="app"></main><button class="back-top" type="button">Retour en haut ↑</button>
    <footer class="site-footer"><div class="footer-main"><section><h2>À propos de MyShop</h2><p>MyShop aide les revendeurs à explorer les tendances, comparer les prix de référence et suivre des produits sur plusieurs plateformes.</p></section>
    <section><h2>Plateformes</h2><div class="footer-links">${platformItems}</div></section>
    <section><h2>Mon espace</h2><div class="footer-links"><a href="surveillance.html">Panier de surveillance <span class="watch-count">0/${MAX_WATCHED_PRODUCTS}</span></a><a href="profil.html">Profil revendeur</a><a href="surveillance.html">Alertes et tendances</a></div></section>
    <section><h2>Support & contact</h2>${support ? `<a href="mailto:${esc(support)}">${esc(support)}</a>` : `<p class="support-placeholder">Adresse Gmail de support à renseigner dans <code>js/config.js</code>.</p>`}</section></div>
    <div class="footer-legal"><a href="legal.html#mentions">Mentions légales</a><a href="legal.html#cgu">CGU</a><a href="legal.html#confidentialite">Confidentialité</a><span>© 2026 MyShop</span></div><p class="legal-note" id="legal">Les pages légales doivent être complétées avec les informations de l’éditeur avant le déploiement public.</p></footer>
    <nav class="mobile-dock" aria-label="Navigation principale">${nav([["index", "home", "Accueil"], ["catalogue", "grid", "Catalogue"], ["surveillance", "mark", "Surveillance"], ["profil", "user", "Profil"]])}</nav>`);
  document.querySelector(".back-top").addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  document.addEventListener("watch:changed", () => refreshWatchCount(USER));
}

function refreshWatchCount(user) {
  const count = user?.uid ? watchList(user).length : 0;
  document.querySelectorAll(".watch-count").forEach(node => { node.textContent = `${count}/${MAX_WATCHED_PRODUCTS}`; });
}

export function updateTicker(products = []) {
  const track = document.getElementById("ticker-track");
  if (!track || !products.length) return;
  const items = products.slice(0, 16).map(product => {
    const src = product.images?.[0] || product.image;
    const thumb = src ? `<img src="${esc(safeUrl(src))}" alt="" loading="lazy" onerror="this.hidden=true">` : "";
    return `<a class="ticker-item" href="produit.html?id=${encodeURIComponent(product.id)}" data-go>${thumb}<span>${esc(product.title || product.name)}</span><b>${esc(price(product))}</b><em>${product.profitMargin != null ? `+${formatPercent(product.profitMargin)}` : "Marge à confirmer"}</em></a>`;
  }).join("");
  track.innerHTML = `<div class="ticker-sequence">${items}</div><div class="ticker-sequence" aria-hidden="true" inert>${items}</div>`;
}

function setAccount(u) {
  const a = document.getElementById("acc");
  if (!u) return;
  a.href = "profil.html"; a.dataset.tip = "Profil"; a.setAttribute("aria-label", "Profil");
  const avatar = u.photoURL ? `<img src="${esc(safeUrl(u.photoURL))}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar-initials">${esc((u.displayName || u.email || "U").slice(0, 2).toUpperCase())}</span>`;
  a.innerHTML = `${avatar}<span>Profil</span>`;
}

// Auth Guard : un visiteur non connecté qui clique sur un produit ou une action est envoyé vers connexion.html.
document.addEventListener("click", async e => {
  const a = e.target.closest("[data-go],[data-ext],[data-watch]");
  if (!a) return;
  if (a.dataset.watch !== undefined) {
    e.preventDefault();
    if (!USER) { toLogin(curPage(), "action"); return; }
    if (a.disabled) return;
    a.disabled = true;
    try {
      const result = await toggleWatch(USER, a.dataset.watch);
      if (result.limitReached) {
        window.alert(`Limite atteinte : vous pouvez surveiller au maximum ${MAX_WATCHED_PRODUCTS} produits. Retirez-en un avant d’en ajouter un autre.`);
        return;
      }
      document.querySelectorAll("[data-watch]").forEach(button => {
        if (button.dataset.watch !== a.dataset.watch) return;
        button.classList.toggle("on", result.added);
        button.setAttribute("aria-pressed", String(result.added));
      });
      document.dispatchEvent(new CustomEvent("watch:changed", { detail: { id: a.dataset.watch, on: result.added } }));
    } catch (error) {
      console.error("[MyShop] Enregistrement Firestore impossible.", error);
      window.alert("Impossible d’enregistrer ce produit dans Firestore. Vérifiez votre connexion et les règles Firestore, puis réessayez.");
    } finally { a.disabled = false; }
  }
});

export async function boot({ page, guard = false, render }) {
  if (guard) {
    // Le BFCache peut restaurer une page déjà rendue : vide son contenu avant cache et revalide au retour.
    window.addEventListener("pagehide", () => document.getElementById("app")?.replaceChildren());
    window.addEventListener("pageshow", event => {
      if (!event.persisted) return;
      if (!currentUser()?.uid) {
        clearBrowserSession();
        document.body.innerHTML = `<main class="glass login"><h1 class="fd">Connexion requise</h1><p>Redirection vers la page de connexion…</p></main>`;
        location.replace("connexion.html?next=" + encodeURIComponent(curPage()) + "&reason=guard");
      } else location.reload();
    });
  }
  layout(page);
  USER = await authReady;
  setAccount(USER);
  if (guard && !USER) {
    clearBrowserSession();
    document.body.innerHTML = `<main class="glass login"><h1 class="fd">Connexion requise</h1><p>Redirection vers la page de connexion…</p></main>`;
    location.replace("connexion.html?next=" + encodeURIComponent(curPage()) + "&reason=guard");
    return;
  }
  onUser(u => {
    if (!u) {
      clearBrowserSession();
      if (page !== "connexion") {
        // Retire immédiatement le DOM sensible; les rendus asynchrones ne détiennent plus de nœud visible.
        document.body.innerHTML = `<main class="glass login"><h1 class="fd">Connexion requise</h1><p>Votre session a expiré. Redirection vers la connexion…</p></main>`;
        location.replace("connexion.html?next=" + encodeURIComponent(curPage()) + "&reason=guard");
      }
      return;
    }
    if ((u.uid || null) !== (USER?.uid || null)) location.reload();
  });
  if (USER) {
    await loadWatchList(USER);
    if (!currentUser()?.uid || currentUser().uid !== USER.uid) return;
    subscribeWatchList(USER);
    refreshWatchCount(USER);
    try { updateTicker(await getProducts()); } catch (error) { console.warn("[MyShop] Tendances du catalogue indisponibles.", error); }
  }
  if (guard && !currentUser()?.uid) {
    clearBrowserSession();
    document.body.innerHTML = `<main class="glass login"><h1 class="fd">Connexion requise</h1><p>Redirection vers la page de connexion…</p></main>`;
    location.replace("connexion.html?next=" + encodeURIComponent(curPage()) + "&reason=guard");
    return;
  }
  await render({ user: USER, app: document.getElementById("app") });
}

