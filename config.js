// Configuration publique du navigateur uniquement. Les secrets fournisseurs restent côté fonctions Netlify.
export const CONFIG = {
  firebase: {
    apiKey: "AIzaSyAOYmI2GaAs1XicBQC9gdFM1xDBybxiPtY",
    authDomain: "myshop-10.firebaseapp.com",
    projectId: "myshop-10",
    storageBucket: "myshop-10.firebasestorage.app",
    messagingSenderId: "474946515721",
    appId: "1:474946515721:web:eaf877545fdb807f2919d8"
  },
  SUPPORT_EMAIL: "hprodz22@gmail.com", // Adresse officielle du support
  API_BASE: "/api", // Fonctions serveur Netlify : /api/products et /api/products/:id/history
  STREAM_URL: "",
  REFRESH_MS: 60000,
  CACHE_MS: 30000,
  MAX_WATCHED_PRODUCTS: 30
};
