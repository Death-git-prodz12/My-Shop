# MyShop — GitHub Pages + Firebase

MyShop est une application statique HTML/CSS/JavaScript. GitHub Pages sert les pages et les fichiers; Firebase Authentication et Firestore gèrent les sessions et les données depuis le navigateur. Aucune fonction Netlify ni serveur Node n’est nécessaire au fonctionnement du site.

## Pages

- `index.html` est l’accueil et la première page servie par GitHub Pages.
- `catalogue.html` affiche le catalogue Firestore après connexion.
- `alertes.html` présente séparément les variations de prix des produits suivis.
- `surveillance.html` gère la liste personnelle de produits suivis.
- `profil.html` lit le document privé `users/{uid}` et permet de créer ou modifier la présentation de la boutique.
- `boutique.html` affiche les boutiques publiques de la collection `sellers`.

## Configuration Firebase

1. Dans Firebase Console, activez Authentication avec Google et autorisez le domaine GitHub Pages (`<compte>.github.io`) ou votre domaine personnalisé.
2. Créez la base Firestore dans le projet indiqué par `js/config.js`. La configuration web Firebase est publique; ne placez aucune clé de compte de service ou secret marchand dans le navigateur.
3. Publiez les règles de `firestore.rules` depuis Firestore Console. Sans ces règles, les lectures/écritures directes du navigateur seront refusées.
4. Ajoutez les fiches catalogue dans `products`. Elles peuvent contenir `id`, `title`, `price`, `costPrice`, `currency`, `platform`, `sourceUrl`, `images`, `category`, `rating` et les champs de variation tels que `previousPrice`. La collection est lisible uniquement par un utilisateur connecté et modifiable seulement depuis un outil administrateur.
5. Les profils publics créés depuis l’onglet « Ma boutique » sont écrits dans `sellers/{shopId}`. Les documents publics ne contiennent que `shopId`, `name`, `description` et `directoryEnabled`.
6. Les produits affichés dans une boutique publique peuvent être ajoutés dans sa sous-collection `sellers/{shopId}/products`; elle est en lecture seule depuis le site.
7. Déployez le dossier tel quel sur GitHub Pages. `index.html` est la page d’entrée à la racine; ouvrez `index.html` pour commencer à parcourir le projet dans VS Code.

## Collections Firestore

- `products/{productId}` : catalogue consultable par les utilisateurs authentifiés. Les documents sont en lecture seule depuis le site.
- `users/{uid}` : profil et liste `watchedProductIds`, lisibles par leur propriétaire.
- `users/{uid}/watchlist/{itemId}` : éléments synchronisés en temps réel; les règles Firestore limitent la liste à 30 entrées par profil.
- `users/{uid}/sellerActivity` et `users/{uid}/sellerTransactions` : historiques privés et en lecture seule depuis le navigateur.
- `sellers/{shopId}` : profil de boutique publiquement visible seulement quand `directoryEnabled` vaut `true`.
- `sellers/{shopId}/products/{productId}` : inventaire public en lecture seule.

Les marges sont calculées côté navigateur à partir du coût et du prix pour les utilisateurs connectés. Les règles empêchent l’écriture client des fiches produit, des ventes, des compteurs de transactions et des badges de vérification. Une application statique seule ne peut pas authentifier une commande marchande ni attribuer de ventes fiables; ces compteurs ne changent donc que si des données de confiance existent déjà dans Firestore.

## Connexion et diagnostic

Les pages attendent `onAuthStateChanged` avant d’afficher leur interface. Les pages privées redirigent vers `connexion.html` quand aucune session n’existe. Si les données restent vides, vérifiez le domaine autorisé dans Firebase Authentication, le projet sélectionné dans `js/config.js`, les noms de collections ci-dessus et les règles Firestore publiées. Les détails Firestore apparaissent dans la console du navigateur.
