import { boot, card, empty, esc, price } from "../ui.js";
import { getProducts, getHistory, watchLive } from "../api.js";
import { watchList } from "../store.js";
import { MAX_WATCHED_PRODUCTS } from "../watch-policy.js";

let trendChart;
let drawRevision = 0;

function historyPoint(point) {
  const value = Number(point?.price);
  if (!Number.isFinite(value) || value < 0) return null;
  const rawDate = point?.t ?? point?.date ?? point?.timestamp;
  const date = rawDate ? new Date(rawDate) : null;
  return { value, label: date && Number.isFinite(date.getTime()) ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "Relevé" };
}

boot({ page: "surveillance", guard: true, render: async ({ user, app }) => {
  let products = await getProducts();
  const draw = async () => {
    const revision = ++drawRevision;
    const followed = watchList(user).map(id => products.find(product => product.id === id)).filter(Boolean);
    trendChart?.destroy(); trendChart = undefined;
    if (!followed.length) {
      app.innerHTML = `<div class="sh"><div><h2 class="fd">Panier de surveillance</h2><small>0 / ${MAX_WATCHED_PRODUCTS} produits suivis</small></div></div>` +
        empty("mark", "Aucun produit surveillé", "Appuyez sur l'icône marque-page d'un produit pour l'ajouter ici.", "catalogue.html", "Parcourir le catalogue");
      return;
    }
    const initial = followed.find(product => product.id === app.dataset.trendProduct) || followed[0];
    app.dataset.trendProduct = initial.id;
    app.innerHTML = `<div class="sh"><div><h2 class="fd">Panier de surveillance</h2><small>${followed.length} / ${MAX_WATCHED_PRODUCTS} produits suivis · accès gratuit</small></div></div>
      <section class="glass pad watch-trend" aria-labelledby="trend-title">
        <div class="trend-head"><div><h3 class="fd" id="trend-title">Tendance des prix</h3><p class="mu">Historique du produit sélectionné</p></div>
          <label class="trend-select-label" for="trend-product">Produit</label><select class="trend-select" id="trend-product">${followed.map(product => `<option value="${esc(product.id)}" ${product.id === initial.id ? "selected" : ""}>${esc(product.title)}</option>`).join("")}</select>
        </div><div class="trend-chart-wrap" id="trend-chart-wrap"><canvas id="watch-trend-chart" role="img" aria-label="Graphique de l'évolution du prix"></canvas></div>
        <p class="trend-caption" id="trend-caption">Prix actuel : ${esc(price(initial))}</p>
      </section>
      <div class="sh watch-list-heading"><h3 class="fd">Produits suivis</h3><small>${followed.length} / ${MAX_WATCHED_PRODUCTS}</small></div>
      <div class="gr">${followed.map(product => card(product, user)).join("")}</div>`;

    const select = document.getElementById("trend-product");
    select.addEventListener("change", async () => {
      app.dataset.trendProduct = select.value;
      await renderChart(followed.find(product => product.id === select.value), revision);
    });
    await renderChart(initial, revision);
  };

  const renderChart = async (product, revision) => {
    const canvas = document.getElementById("watch-trend-chart");
    if (!canvas || !product || revision !== drawRevision) return;
    const caption = document.getElementById("trend-caption");
    const history = await getHistory(product.sourceProductId || product.id);
    if (revision !== drawRevision || !document.getElementById("watch-trend-chart")) return;
    const points = history.map(historyPoint).filter(Boolean);
    if (!window.Chart) {
      document.getElementById("trend-chart-wrap").innerHTML = `<div class="chart-empty">Le graphique n'a pas pu être chargé. Vérifiez l'accès au CDN Chart.js et actualisez la page.</div>`;
      return;
    }
    if (!points.length) {
      document.getElementById("trend-chart-wrap").innerHTML = `<div class="chart-empty">Aucun historique de prix n'est encore disponible pour ce produit. Connectez une API avec <code>GET /products/${esc(product.id)}/history</code>.</div>`;
      caption.textContent = `Prix actuel : ${price(product)} · historique en attente`;
      return;
    }
    const colors = getComputedStyle(document.body);
    const ink = colors.getPropertyValue("--tx").trim() || "#191b27";
    const muted = colors.getPropertyValue("--mu").trim() || "#70778a";
    const accent = colors.getPropertyValue("--ice").trim() || "#6357d9";
    trendChart = new window.Chart(canvas.getContext("2d"), {
      type: "line",
      data: { labels: points.map(point => point.label), datasets: [{
        label: "Prix", data: points.map(point => point.value), borderColor: accent,
        backgroundColor: "rgba(99,87,217,.12)", fill: true, tension: .35,
        pointRadius: points.length > 30 ? 0 : 3, pointHoverRadius: 5,
        borderWidth: 2, spanGaps: true
      }] },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { intersect: false, mode: "index" },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: context => new Intl.NumberFormat("fr-FR", { style: "currency", currency: product.currency || "USD" }).format(context.parsed.y) } } },
        scales: {
          x: { grid: { display: false }, ticks: { color: muted, maxTicksLimit: 7 } },
          y: { beginAtZero: false, grid: { color: "rgba(120,125,150,.14)" }, ticks: { color: muted, callback: value => new Intl.NumberFormat("fr-FR", { style: "currency", currency: product.currency || "USD", maximumFractionDigits: 0 }).format(value) } }
        }
      }
    });
    caption.textContent = `${product.title} · ${points.length} relevé${points.length > 1 ? "s" : ""} · prix actuel : ${price(product)}`;
    canvas.setAttribute("aria-label", `Évolution du prix de ${product.title}`);
    canvas.style.color = ink;
  };

  document.addEventListener("watch:changed", draw);
  await draw();
  const stopLive = watchLive(async () => {
    try { products = await getProducts(true); await draw(); }
    catch (error) { console.warn("[MyShop] Actualisation de la veille impossible.", error); }
  });
  window.addEventListener("pagehide", stopLive, { once: true });
} });
