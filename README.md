# Wao Bank — Backend API

API Node.js/Express avec base de données SQLite réelle, pour remplacer le stockage `localStorage`
du site par un vrai serveur : inscription, connexion, virements, prêts.

## 1. Installation locale

Prérequis : [Node.js](https://nodejs.org) version 18 ou plus, installé sur ton ordinateur.

```bash
cd wao-bank-backend
npm install
cp .env.example .env
```

Ouvre `.env` et remplace `JWT_SECRET` par une valeur aléatoire longue. Tu peux en générer une avec :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Démarre le serveur :

```bash
npm start
```

L'API tourne sur `http://localhost:4000`. Un fichier `wao-bank.sqlite` est créé automatiquement à côté
de `server.js` — c'est ta vraie base de données, tu peux l'ouvrir avec [DB Browser for SQLite](https://sqlitebrowser.org/)
pour voir les tables `users` et `transactions`.

## 2. Endpoints disponibles

| Méthode | Route                  | Auth | Description                              |
|---------|-------------------------|------|-------------------------------------------|
| POST    | `/api/register`         | non  | Créer un compte (name, email, password, country, city, phone) |
| POST    | `/api/login`            | non  | Se connecter (email, password) → renvoie un token |
| GET     | `/api/me`                | oui  | Profil du client connecté                |
| PUT     | `/api/me`                | oui  | Modifier nom / téléphone                 |
| GET     | `/api/transactions`     | oui  | Historique des transactions              |
| POST    | `/api/transfer`         | oui  | Virement (destination, amount, note)     |
| POST    | `/api/loan/simulate`    | non  | Calcul d'amortissement (amount, years)   |
| POST    | `/api/loan/validate`    | oui  | Valider le prêt et créditer le compte    |

Pour les routes "oui", ajoute l'en-tête :
```
Authorization: Bearer <token reçu à la connexion ou à l'inscription>
```

## 3. Déployer en ligne (pour que le site y accède vraiment)

Le fichier HTML de ton site est publié sur Claude et ne peut pas appeler un serveur externe
depuis cet aperçu — il faut héberger cette API quelque part avec une vraie adresse publique.
Deux options simples et gratuites pour démarrer :

**Render.com**
1. Crée un compte sur render.com, connecte ton dépôt GitHub contenant ce dossier.
2. "New Web Service" → build command `npm install`, start command `npm start`.
3. Ajoute les variables d'environnement (`JWT_SECRET`, `CORS_ORIGIN`) dans l'onglet Environment.
4. Une fois déployé, tu obtiens une URL du type `https://wao-bank-api.onrender.com`.

**Railway.app**
Fonctionne de façon similaire : connecte le dépôt, Railway détecte Node.js automatiquement.

⚠️ Le disque de ces plateformes gratuites peut être réinitialisé lors d'une remise en veille.
Pour une vraie mise en production, remplace SQLite par une base PostgreSQL managée
(Render, Railway et Supabase en proposent une gratuite) — la structure du code (`db.js`) est
volontairement simple pour faciliter cette migration plus tard.

## 4. Adapter le site (site.html) pour utiliser cette API

Une fois l'API en ligne, il faut remplacer dans `site.html` les fonctions qui lisent/écrivent
`localStorage` (`doRegister`, `doLogin`, `doTransfer`, `validateLoan`, etc.) par des appels
`fetch()` vers ces endpoints, et stocker le token reçu (par ex. dans une variable JS en mémoire
ou dans `localStorage` uniquement pour garder la session ouverte sur cet appareil — les vraies
données, elles, resteront sur le serveur).

Dis-le-moi quand ton API est en ligne (donne-moi son URL) et je m'occupe de cette adaptation
du site pour toi.
