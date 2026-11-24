import { boot, ic } from "../ui.js";
import { signIn, loginError } from "../firebase.js";

boot({ page: "connexion", render: async ({ user, app }) => {
  const qs = new URLSearchParams(location.search), n = qs.get("next") || "";
  const next = /^[a-z]+\.html(\?[A-Za-z0-9=&_%.-]*)?$/.test(n) ? n : "index.html"; // pas de redirection vers un autre site
  if (user) { location.replace(next); return; }
  const msg = { guard: "Cette page est réservée aux membres connectés.", product: "Connectez-vous pour consulter la fiche détaillée et l'analyse de ce produit.", action: "Connectez-vous pour utiliser cette fonction (surveillance, accès à la plateforme source)." }[qs.get("reason")] || "Connectez-vous pour accéder à MyShop.";
  app.innerHTML = `<section class="glass login login-branded"><a class="login-brand" href="index.html" aria-label="Retour à MyShop"><img src="assets/MyShop-transparent.png" alt="MyShop"></a><h1 class="fd" style="font-size:40px;margin:0">Connexion requise</h1><p class="mu">${msg}</p><button class="google-signin-btn" id="go" type="button"><span>Continuer avec</span><img class="google-logo" src="assets/Google-transparent.png" alt="Google"></button><p class="err" id="err" role="alert"></p><small>Votre accès est géré par Google. MyShop ne voit jamais votre mot de passe.</small></section>`;
  document.getElementById("go").onclick = async () => {
    const err = document.getElementById("err"); err.textContent = "";
    try { const u = await signIn(); if (u) location.replace(next); } catch (e) { err.textContent = loginError(e); }
  };
} });
