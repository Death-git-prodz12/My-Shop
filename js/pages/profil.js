import { boot, esc, ic, safeUrl } from "../ui.js";
import { logOut, updateDisplayName } from "../firebase.js";
import { watchList } from "../store.js";
import { getProducts } from "../api.js";
import { MAX_WATCHED_PRODUCTS } from "../watch-policy.js";
import { CONFIG } from "../config.js";

const fmt = value => value ? new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";

boot({ page: "profil", guard: true, render: async ({ user, app }) => {
  const catalogueCount = (await getProducts()).length;
  const watchedCount = watchList(user).length;
  const name = user.displayName || "Utilisateur";
  const avatar = user.photoURL
    ? `<img src="${esc(safeUrl(user.photoURL))}" alt="" referrerpolicy="no-referrer">`
    : `<span>${esc(name.slice(0, 2).toUpperCase())}</span>`;

  app.innerHTML = `<div class="profile-shell">
    <header class="profile-heading"><div><p class="eyebrow">ESPACE PERSONNEL</p><h1>Mon profil</h1><p>Gérez votre compte et retrouvez vos outils de veille.</p></div></header>
    <section class="profile-hero-card">
      <div class="profile-avatar">${avatar}</div>
      <div class="profile-identity"><p class="profile-kicker">COMPTE MYSHOP</p><h2 id="profile-name">${esc(name)}</h2><p class="profile-email">${esc(user.email || "")}</p>
        <button class="profile-pill-button" id="edit-profile" type="button">${ic("user", 16)}Modifier le profil</button>
        <form class="profile-edit-form" id="profile-edit-form" hidden><label for="display-name">Nom affiché</label><div><input id="display-name" name="displayName" maxlength="80" value="${esc(name)}" required><button class="bt" type="submit">Enregistrer</button></div><p id="profile-edit-error" role="status"></p></form>
      </div>
      <div class="profile-account-meta"><span>Compte connecté</span><b>${user.providerData.some(provider => provider.providerId === "google.com") ? "Google" : "MyShop"}</b><small>Depuis ${fmt(user.metadata.creationTime)}</small></div>
    </section>

    <section class="profile-dashboard-card">
      <div class="profile-card-heading"><div><p class="eyebrow">VOTRE ACTIVITÉ</p><h2>Tableau de bord Revendeur</h2></div><span class="profile-status-pill">Accès gratuit</span></div>
      <div class="dashboard-content"><div><span class="dashboard-label">Produits surveillés</span><div class="watch-count-large"><strong>${watchedCount}</strong><span>/ ${MAX_WATCHED_PRODUCTS}</span></div><p>Votre sélection est synchronisée avec votre compte.</p></div>
        <a class="profile-pill-button primary" href="surveillance.html">${ic("mark", 16)}Ouvrir le panier de surveillance ${ic("ext", 14)}</a></div>
      <div class="profile-dashboard-foot"><span>${catalogueCount} produits disponibles au catalogue</span><a href="catalogue.html">Explorer les produits →</a></div>
    </section>

    <div class="profile-columns">
      <section class="profile-info-card"><div class="profile-card-heading"><div><p class="eyebrow">PRÉFÉRENCES</p><h2>Paramètres</h2></div></div>
        <div class="profile-setting-row"><span class="setting-symbol">文</span><div><b>Langue</b><small>Langue de l’interface</small></div><span class="setting-value">Français</span></div>
        <div class="profile-setting-row"><span class="setting-symbol">☼</span><div><b>Thème d’affichage</b><small>Apparence actuelle</small></div><span class="setting-value">Clair</span></div>
        <div class="profile-setting-row"><span class="setting-symbol">${ic("bell", 17)}</span><div><b>Notifications</b><small>Alertes de veille MyShop</small></div><span class="setting-active"><i></i>Activées</span></div>
      </section>

      <section class="profile-info-card"><div class="profile-card-heading"><div><p class="eyebrow">AIDE ET COMPTE</p><h2>Support & sécurité</h2></div></div>
        <a class="profile-link-row" href="mailto:${esc(CONFIG.SUPPORT_EMAIL)}"><span class="setting-symbol">@</span><span><b>Contacter le support</b><small>${esc(CONFIG.SUPPORT_EMAIL)}</small></span>${ic("ext", 15)}</a>
        <a class="profile-link-row" href="legal.html#mentions"><span class="setting-symbol">§</span><span><b>Mentions légales</b><small>Informations et politiques MyShop</small></span>${ic("ext", 15)}</a>
        <div class="profile-logout-row"><div><b>Session sécurisée</b><small>Déconnectez-vous de cet appareil.</small></div><button class="profile-pill-button danger" id="out" type="button">${ic("out", 16)}Se déconnecter</button></div>
      </section>
    </div>
  </div>`;

  const form = document.getElementById("profile-edit-form");
  document.getElementById("edit-profile").addEventListener("click", () => {
    form.hidden = !form.hidden;
    if (!form.hidden) document.getElementById("display-name").focus();
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const nextName = document.getElementById("display-name").value.trim();
    const error = document.getElementById("profile-edit-error");
    if (!nextName) { error.textContent = "Saisissez un nom valide."; return; }
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      await updateDisplayName(nextName);
      document.getElementById("profile-name").textContent = nextName;
      document.querySelector(".profile-avatar span")?.replaceChildren(document.createTextNode(nextName.slice(0, 2).toUpperCase()));
      form.hidden = true;
    } catch (exception) {
      error.textContent = "La mise à jour du profil a échoué. Vérifiez votre connexion puis réessayez.";
    } finally { submit.disabled = false; }
  });
  document.getElementById("out").addEventListener("click", async event => {
    event.currentTarget.disabled = true;
    document.body.innerHTML = `<main class="glass login"><h1>Déconnexion…</h1><p>Fermeture de votre session.</p></main>`;
    await logOut();
    location.replace("connexion.html");
  });
} });
