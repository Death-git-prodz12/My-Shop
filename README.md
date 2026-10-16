# MyShop (version modulaire)

Pages : index, catalogue, produit, surveillance, profil, connexion (un fichier HTML chacune).
Code : css/styles.css, js/ (config, firebase, store, api, ui) et js/pages/ (un module par page).
Données : data/products.json (remplacées par l'API si js/config.js > API_BASE est renseigné).

## Mise en ligne (GitHub Pages)
Gardez cette arborescence telle quelle à la racine du dépôt. Firebase : ajoutez votre domaine github.io dans Authentication > Settings > Authorized domains.

## Contrat de l'API (optionnel)
GET {API_BASE}/products -> [{ id, name, source, category, url, linkType: "product"|"search", priceRef, currency, rating, reviews, note, image }]
GET {API_BASE}/products/:id/history -> [{ t, price }]
{STREAM_URL} : Server-Sent Events, un message par mise à jour.

## Limites connues
Le guard est côté navigateur (confort d'usage) : il ne protège pas de vraies données privées. Pour cela, vérifiez le jeton Firebase côté serveur.
