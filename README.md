# MyShop — catalogue et surveillance produits

Application statique en HTML, CSS et JavaScript ES modules, connectée à Firebase Authentication et Firestore.

## Accès et confidentialité

L’accueil, le catalogue, le profil, les fiches produit et la surveillance exigent une session Firebase active. À la déconnexion ou à l’expiration de session, l’interface protégée est retirée, les stockages local et session sont vidés, puis l’utilisateur revient à la connexion. Le rendu vérifie aussi les retours depuis le cache du navigateur.

Cette protection côté navigateur contrôle l’affichage. Comme le catalogue est livré dans `data/products.json`, ce fichier reste téléchargeable directement sur un hébergement statique. Pour protéger les prix au niveau réseau, il faudra servir le catalogue depuis une API qui vérifie les jetons Firebase avant de renvoyer les données.

## Catalogue et calculs

`data/products.json` contient 45 références réparties entre Amazon, AliExpress, Temu, TikTok Shop, Shopify, Shein, Alibaba et CJ Dropshipping. La recherche et les filtres de plateforme, catégorie, marge minimale et prix agissent instantanément. Les compteurs de l’accueil et du profil reprennent le nombre réel d’entrées du catalogue.

Les prix indiqués sont des valeurs statiques de référence, pas des cotations live garanties. Ils varient selon le vendeur, la variante, le marché et la date. Les coûts fournisseurs et les marges sont des estimations de démonstration; vérifiez l’annonce liée avant tout achat ou calcul de revente. Certaines images sont des illustrations représentatives lorsque le marchand ne fournit pas de visuel stable publiquement.

Les fonctions d’ingestion dans `js/ingest.js`, `js/pricing.js` et `js/categories.js` normalisent les plateformes, calculent la marge à partir du coût et affectent la catégorie « Undefined / Divers » aux catégories non reconnues. L’application n’effectue pas de scraping réel : l’extraction des places de marché nécessite une API autorisée.

## Surveillance Firestore

Un compte connecté peut suivre jusqu’à **30 produits** dans sa propre sous-collection `users/{uid}/watchlist/{productId}`. La page écoute cette sous-collection avec `onSnapshot`; l’ajout/retrait passe par `POST /api/watchlist`, qui vérifie le jeton Firebase et applique le plafond dans une transaction serveur. Le profil conserve aussi `watchedProductIds` pour la migration de l’ancienne version et le contrôle atomique du quota. Les règles Firestore autorisent la lecture propriétaire et refusent les écritures client directes. Le catalogue entier et toutes les catégories/fonctions sont gratuits, sans niveau Premium.

## Configuration Firebase

1. Vérifiez ou remplacez la configuration client dans `js/config.js`.
2. Activez Google Authentication et ajoutez le domaine de développement/déploiement dans **Authorized domains**.
3. Créez Firestore en mode production et publiez `firestore.rules`.
4. Vérifiez que le projet Firebase du navigateur est celui où les règles sont publiées.

Les écritures de veille sont faites par les fonctions serveur avec Firebase Admin. Configurez `FIREBASE_SERVICE_ACCOUNT_JSON` et publiez les nouvelles règles avant d'activer ce flux.

## Lancer en local

Pour tester le projet avec ses fonctions API, utilisez Netlify Dev (un serveur statique Python ne fournit pas `/api/watchlist` ni le catalogue protégé) :

```bash
npm install
npx netlify dev
```

Configurez les variables locales à partir de `.env.example`, puis ajoutez le domaine local affiché par Netlify Dev dans les domaines autorisés Firebase. Le projet peut aussi être publié sur Netlify.

## Graphiques d’historique

Chart.js est chargé par CDN dans `surveillance.html`. `js/pages/surveillance.js` appelle `getHistory()` dans `js/api.js`. Pour recevoir des données réelles, renseignez `API_BASE` dans `js/config.js` et exposez :

```text
GET {API_BASE}/products/:id/history
→ [{ "t": "2026-10-18T10:00:00Z", "price": 29.99 }]
```

L’API peut aussi répondre `{ "history": [...] }`. Sans historique, l’écran affiche un état vide explicite.

## Interface MyShop 2.1

L’interface utilise maintenant un thème clair inspiré des grands catalogues e-commerce : en-tête sombre avec recherche, menu de catégories, raccourcis plateformes, badge de surveillance 0/30, modules d’accueil en mini-grilles 2×2, grille catalogue responsive, ticker animé et pied de page en quatre colonnes. La navigation mobile conserve un dock compact.

Le ticker reprend les données actuellement disponibles dans le catalogue. Il ne s’agit pas d’un flux marchand en temps réel tant qu’une API autorisée n’est pas configurée. Pour afficher l’adresse Gmail officielle de support, renseignez `SUPPORT_EMAIL` dans `js/config.js`. Les liens légaux pointent vers `legal.html`, qui contient des champs à compléter avec les coordonnées de l’éditeur et les textes validés avant publication.

## Profil MyShop

La page profil propose une carte d’identité avec modification du nom affiché via Firebase Auth, un tableau de bord de surveillance, les paramètres d’interface et un bloc support/sécurité. L’adresse Gmail du support est centralisée dans `js/config.js` (`SUPPORT_EMAIL`) et utilisée dans le profil et le pied de page.

## API partenaires et actualisation Firestore

Le front-end appelle désormais les fonctions Netlify sous `/api`. Les requêtes catalogue et historique exigent un jeton Firebase Auth valide, vérifié avec Firebase Admin. Le catalogue synchronisé est stocké dans `catalogProducts` et les règles Firestore interdisent son accès direct depuis le navigateur. L'ancien jeu JSON sert uniquement de secours et le chemin public `/data/products.json` est redirigé vers l'API protégée dans le déploiement Netlify.

`netlify/functions/refresh-products.mjs` tourne toutes les 15 minutes. Il récupère les sources configurées en parallèle, réessaie une fois les erreurs temporaires/quotas avec temporisation, puis écrit les prix, le stock et le volume 7 jours quand le fournisseur les transmet. En cas d'échec, les derniers documents Firestore sont conservés; en l'absence de cache, l'API renvoie le jeu de secours. Les pages interrogent l'API environ chaque minute, recalculent la marge dès réception d'un nouveau prix/coût et rafraîchissent les fiches et graphiques. La fraîcheur dépend donc du flux, du quota et de la fréquence de synchronisation; ce n'est pas une garantie de cotation instantanée. Les volumes de ventes ne sont jamais estimés ni inventés. Le planificateur Netlify impose une durée d'exécution maximale de 30 secondes; l'ingestion limite le nombre de produits par cycle pour rester dans cette fenêtre.

Les secrets sont configurés dans Netlify depuis `.env.example` : `FIREBASE_SERVICE_ACCOUNT_JSON`, les identifiants Amazon/AliExpress et les URL/token des feeds partenaires autorisés. Aucun secret ne doit être placé dans `js/config.js`. Amazon est implémenté avec **Creators API** (OAuth2), car PA-API 5 a été dépréciée. Il faut un compte Associates, l'accès Creators API, un Partner Tag valide et des identifiants régionaux. AliExpress nécessite une méthode Open Platform activée pour votre application et ses paramètres métier exacts. Temu, Shein, Alibaba, TikTok Shop et CJ utilisent des feeds publics/partenaires configurés côté serveur : il n'y a pas de scraping public automatique dans cette version.

Pour ingérer des données sans clé, configurez `SHOPIFY_PUBLIC_PRODUCT_URLS` avec les URLs de fiches produit Shopify publiques, par exemple `["https://votre-boutique.com/products/handle"]`. MyShop appelle alors l'Ajax Product API officielle (`/{locale}/products/{handle}.js`), non authentifiée, et prend son titre, son image, son prix storefront visible et sa disponibilité. La devise vient du panier storefront public ou de `SHOPIFY_PUBLIC_CURRENCY` (à définir si le storefront ne la renvoie pas). Le coût fournisseur n'est pas renvoyé par cet endpoint : sans `costPrice`, la marge reste à confirmer. `PUBLIC_PRODUCT_FEEDS_JSON` accepte également des endpoints JSON publics sans clé; chaque produit doit fournir un titre, un prix, une URL produit et une devise (`currency` ou `feed.currency`). N'utilisez que des URLs et données publiquement accessibles dont l'usage est autorisé. Les places de marché Amazon, AliExpress, Temu, Shein et Alibaba ne proposent pas une API gratuite et universelle donnant le prix exact de tous les produits sans autorisation; MyShop conserve alors les liens directs existants et ne peut pas vérifier le prix final du marchand.

Pour publier :

1. Déployer le dossier sur Netlify et publier `firestore.rules` dans le même projet Firebase que `FIREBASE_PROJECT_ID`.
2. Installer les dépendances de fonctions avec `npm install`, puis renseigner les variables de `.env.example` dans les paramètres Netlify. Pour `FIREBASE_SERVICE_ACCOUNT_JSON`, coller le JSON du compte de service en variable secrète côté Netlify seulement.
3. Vérifier l'URL et les méthodes partenaires permises, puis publier. Les fonctions planifiées s'exécutent sur le site publié; utilisez le bouton **Run now** dans Netlify pour lancer la synchronisation à la demande.
4. Localement, utiliser `npx netlify dev` (et les variables dans un `.env` local ignoré par Git). Un serveur statique Python ne fournit pas les fonctions `/api`.

Les comptes partenaires, autorisations, quotas, marketplaces et flux doivent être fournis par l'administrateur. Tant qu'ils ne le sont pas, le système répond avec les données de secours et indique un mode fallback; il ne prétend pas fournir des prix live.
