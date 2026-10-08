# Mes tâches

Ton app de tâches perso, hébergée gratuitement sur Cloudflare, que Claude peut remplir pour toi.

Tu dis à Claude « j'ai besoin de la liste des ingrédients pour mes lasagnes », il crée la tâche *Courses pour les lasagnes* avec un ingrédient par case à cocher, et tu la retrouves sur ton téléphone au supermarché.

- **Interface web** : protégée par ton mot de passe, pensée pour le téléphone (ajoutable à l'écran d'accueil), mode sombre automatique, se met à jour toute seule quand Claude ajoute quelque chose.
- **Serveur MCP** sur `/mcp` : c'est l'adresse que tu donnes à Claude comme connecteur personnalisé. Connexion sécurisée par OAuth : Claude passe par ta page, tu tapes ton mot de passe et tu cliques sur « Autoriser ».
- **Stack** : un Cloudflare Worker (TypeScript), une base D1 (SQLite) pour les tâches, un espace KV pour les jetons de connexion. Aucune dépendance côté interface.

## Ce que Claude peut faire

| Outil | Exemple de demande |
|---|---|
| `creer_tache` | « J'ai besoin de la liste des ingrédients pour mes lasagnes » |
| `ajouter_elements` | « Ajoute du papier toilette à ma liste de courses » |
| `lister_taches` | « Qu'est-ce qu'il me reste à faire cette semaine ? » |
| `cocher_elements` | « J'ai déjà le beurre et la farine, coche-les » |
| `modifier_tache` | « Repousse le dentiste à lundi », « C'est fait pour la facture » |
| `lister_categories` | Utilisé par Claude pour réutiliser tes catégories existantes |
| `supprimer_tache` | « Supprime la tâche sur l'ampoule » |

Le serveur donne aussi à Claude quelques consignes : un ingrédient par élément avec sa quantité, catégorie « Courses » pour les listes de courses, et compléter une liste de courses déjà ouverte plutôt que d'en créer une deuxième.

## Mise en ligne (une quinzaine de minutes)

Il te faut Node.js 20 ou plus et un compte Cloudflare gratuit.

```bash
npm install
npx wrangler login
```

**1. Créer la base de données et l'espace des jetons**

```bash
npx wrangler d1 create mes-taches
npx wrangler kv namespace create OAUTH_KV
```

Chaque commande affiche un identifiant : colle-les dans `wrangler.jsonc` à la place de `REMPLACE_PAR_TON_ID_D1` et `REMPLACE_PAR_TON_ID_KV`. Si Wrangler propose d'ajouter la configuration lui-même, réponds non : elle est déjà dans le fichier.

**2. Créer les tables**

```bash
npm run db:migrate:remote
```

**3. Déployer**

```bash
npm run deploy
```

Wrangler affiche l'adresse de ton app, du type `https://mes-taches.<ton-sous-domaine>.workers.dev`. Si c'est ton premier Worker, il te fait d'abord choisir ce sous-domaine.

**4. Définir tes secrets**

```bash
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
```

- `APP_PASSWORD` : le mot de passe de ton app (8 caractères minimum, prends-en un vrai).
- `SESSION_SECRET` : une longue chaîne aléatoire, par exemple le résultat de `openssl rand -base64 48`.

Tant que ces deux secrets ne sont pas définis, l'app affiche « Configuration incomplète ».

**5. Ouvrir l'app**

Va sur ton adresse, connecte-toi. Sur iPhone : Partager, puis « Sur l'écran d'accueil ». Sur Android : menu de Chrome, puis « Ajouter à l'écran d'accueil ».

## Brancher Claude

1. Dans Claude, ouvre les réglages des connecteurs et choisis d'ajouter un connecteur personnalisé.
2. Donne-lui un nom (« Mes tâches ») et l'adresse **`https://mes-taches.<ton-sous-domaine>.workers.dev/mcp`** (avec `/mcp` à la fin). Laisse vides les champs de client ID et de secret.
3. Claude ouvre ta page de connexion : tape ton mot de passe, puis clique sur « Autoriser ».
4. Le connecteur marche ensuite sur le web, l'app desktop et l'app mobile. Au premier usage, Claude peut te demander la permission d'utiliser ses outils : tu peux les autoriser une fois pour toutes.

Claude renouvelle son accès tout seul. Si tu ne t'en sers pas pendant 90 jours, il faudra juste refaire l'étape 3.

## Développer en local

```bash
cp .dev.vars.example .dev.vars   # mets un mot de passe de test dedans
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

`npm run typecheck` vérifie le TypeScript. Si tu modifies `wrangler.jsonc`, relance `npm run types`.

## Organisation du code

```
src/
  index.ts      Point d'entrée : branche OAuth, le serveur MCP et l'interface
  mcp.ts        Les outils que Claude appelle, et ses consignes
  db.ts         Lecture et écriture des tâches (partagé par l'interface et MCP)
  web.ts        Pages, API de l'interface, page d'autorisation de Claude
  auth.ts       Mot de passe, cookie de session, limite de tentatives
  app-page.ts   L'interface (HTML, CSS et JS)
  html.ts       Gabarit commun, couleurs, pages de connexion et d'autorisation
  icons.ts      Icônes de l'app
migrations/     Schéma de la base D1
```

Pour ajouter une colonne, crée `migrations/0002_ma_modif.sql`, puis lance `npm run db:migrate:local` et `npm run db:migrate:remote`.

## Sécurité, en bref

- Tout passe en HTTPS (workers.dev ou ton domaine).
- Interface : un mot de passe, comparé en temps constant, avec blocage de 15 minutes après 8 essais ratés depuis la même adresse IP. Le cookie de session est signé, `HttpOnly`, `Secure`, et dure 60 jours.
- Claude : OAuth 2.1 avec PKCE. Les jetons sont stockés hachés dans KV, et Claude ne peut se connecter qu'après ton mot de passe et ton clic sur « Autoriser ».
- Pour déconnecter tous tes appareils d'un coup, change `SESSION_SECRET`. Pour couper l'accès de Claude, supprime le connecteur dans ses réglages.

## Domaine personnalisé (facultatif)

Dans le tableau de bord Cloudflare, ajoute un domaine à ton Worker (Workers, puis ton Worker, puis Paramètres, puis Domaines). L'app marche aussitôt sur la nouvelle adresse ; pense à remplacer l'URL du connecteur dans Claude, car chaque adresse a ses propres jetons.
