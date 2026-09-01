# iladitquoi

Communauté d’anecdotes courtes pour les métiers du soin, avec publication modérée, votes, profils, carnet privé et liens de partage révocables.

## Développement

```bash
npm install
npm run build
```

Le build vérifie les contrats frontend et API, génère les pages statiques dans `public/` et produit les bundles navigateur avec esbuild.

## Interface

Le thème sombre **Signal Nuit** est défini dans `DESIGN.md` et centralisé dans `theme.css`. Il couvre l’accueil, le profil, l’authentification, l’administration, les règles et les pages légales. `design-board.html` reste le board de comparaison et n’est pas servi comme écran public.

## Déploiement

Le projet cible Node.js 24, Vercel et Supabase. Consulter `DEPLOY.md` pour la configuration initiale et `OPERATIONS.md` pour la modération et l’exploitation quotidienne.
