import { boot, esc, ic, safeUrl, price, extLabel, catLabel, lineChart, empty, marginChip } from "../ui.js";
import { formatPercent } from "../pricing.js";
import { getProduct, getHistory, getCompetitors, watchLive } from "../api.js";
import { isWatched } from "../store.js";

boot({ page: "produit", guard: true, render: async ({ user, app }) => {
  const productId = new URLSearchParams(location.search).get("id");
  const drawProduct = async (force = false) => {
  const p = await getProduct(productId, force);
  if (!p) { app.innerHTML = empty("info", "Produit introuvable", "Ce produit n'existe plus ou le lien est incorrect.", "catalogue.html", "Retour au catalogue"); return; }
  document.title = p.name + " — MyShop";
  const [history, competitors] = await Promise.all([getHistory(p.sourceProductId || p.id), getCompetitors(p.id)]);
  const h = history.map(x => +x.price).filter(Number.isFinite), w = isWatched(user, p.id);
  const kp = [["chart", "Note", p.rating != null ? p.rating + " / 5" : "—"], ["users", "Avis", p.reviews ? p.reviews.toLocaleString("fr-FR") : "—"], ["check", "Dernier relevé", p.priceCheckedAt || "—"]]
    .map(([i, l, v]) => `<div class="glass"><span class="chip">${ic(i === "users" ? "user" : i, 16)}</span><span><small>${l}</small><b>${esc(v)}</b></span></div>`).join("");
  const cur = n => new Intl.NumberFormat("fr-FR", { style: "currency", currency: p.currency || "USD" }).format(n);
  const known = Number.isFinite(p.profitMargin), tier = p.marginTier || "unknown";
  const sim = p.costMode === "simulation" || p.dataMode === "demo";
  const margin = `<div class="margin-panel tier-${tier}" aria-label="Marge bénéficiaire">
    <div class="mp-head"><span>Marge bénéficiaire</span><b>${known ? formatPercent(p.profitMargin) : "À confirmer"}</b></div>
    <div class="meter" aria-hidden="true"><i style="width:${known ? Math.max(0, Math.min(100, p.profitMargin)) : 0}%"></i></div>
    ${known || p.profitAmount != null ? `<div class="ln"><span>Prix de vente</span><span>${p.price != null ? esc(cur(p.price)) : "—"}</span></div>
    <div class="ln"><span>Coût d’achat</span><span>${p.costPrice != null ? esc(cur(p.costPrice)) : "—"}</span></div>
    <div class="ln"><span>Bénéfice brut / unité</span><span>${p.profitAmount != null ? esc(cur(p.profitAmount)) : "—"}</span></div>` : `<p class="formula mu">Renseignez le coût fournisseur pour calculer la marge : aucun chiffre n’est inventé.</p>`}
    <p class="formula mu">Marge brute = (prix − coût) / prix × 100, avant livraison, taxes, retours et frais de plateforme${sim ? " · coût simulé pour démonstration" : ""}${p.marginSource === "declared" ? " · valeur communiquée par la source" : ""}.</p></div>
  ${p.categoryVia === "fallback" ? `<p class="fallback-note">Catégorie d’origine « ${esc(p.rawCategory || "non renseignée")} » non reconnue : produit conservé dans <b>Undefined / Divers</b>.</p>` : ""}`;
  const externalLink = p.sourceUrl ? `<a class="bt w" style="margin:16px 0 8px" href="${esc(safeUrl(p.sourceUrl))}" target="_blank" rel="noopener noreferrer" data-ext>${ic("ext", 16)}${esc(extLabel(p))}</a>` : `<button class="bt w" style="margin:16px 0 8px" disabled>Lien externe indisponible</button>`;
  const comparison = competitors.length ? `<section class="glass pad competitor-panel"><h3 class="fd">Comparaison des offres</h3>${competitors.map(c => `<div class="ln"><span>${esc(c.platform)} · ${esc(c.title)}</span><span>${esc(price(c))}</span></div>`).join("")}</section>` : `<div class="glass chart-empty"><span>Comparaison concurrentielle disponible quand l’API fournit GET /products/${encodeURIComponent(p.id)}/competitors.</span></div>`;
  app.innerHTML = `<a class="back" href="catalogue.html">${ic("back", 16)}Catalogue</a>
<div class="pg"><div><div class="glass pad"><div class="row" style="align-items:flex-start;flex-wrap:wrap;margin-bottom:14px"><div><h2 class="fd">${esc(p.title || p.name)}</h2><small>${esc(p.platform || p.source)} · ${esc(catLabel(p))}</small><div class="badge-row">${marginChip(p)}</div></div></div>
${h.length > 1 ? lineChart(h) : `<div class="empty">${ic("chart", 28)}<p>Aucun historique de prix disponible pour le moment. Les relevés apparaîtront après les prochains cycles de synchronisation fournisseur.</p></div>`}</div>
<div class="kp">${kp}</div>${comparison}</div>
<aside class="glass pad tk2"><small>Prix de référence</small><div class="big">${esc(price(p))}</div>
${externalLink}
<button class="bt g w ${w ? "on" : ""}" data-watch="${esc(p.id)}" aria-pressed="${w}">${ic("mark", 16)}<span class="t1">Ajouter à la surveillance</span><span class="t2">Surveillé</span></button>
${margin}<div style="margin-top:16px"><div class="ln"><span>Type de lien</span><span>${p.linkType === "product" ? "Fiche produit directe" : "Recherche sur la plateforme"}</span></div>
<div class="ln"><span>Devise</span><span>${esc(p.currency || "USD")}</span></div></div>
<p class="mu" style="font-size:11.5px;margin-top:12px;display:flex;gap:8px;line-height:1.5">${ic("info", 16)}<span>${esc(p.note || "")} Vérifiez toujours le prix et la disponibilité sur la plateforme.</span></p></aside></div>`;
  };
  await drawProduct();
  const stopLive = watchLive(() => drawProduct(true));
  window.addEventListener("pagehide", stopLive, { once: true });
} });
