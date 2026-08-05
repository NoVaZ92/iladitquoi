# Lancer la beta gratuite

Cette configuration utilise Vercel Hobby et Supabase Free. Elle convient pour une beta sans publicite, sans partenariat et sans donnees de patient. Le cout fixe est nul, hors nom de domaine.

## 1. Creer Supabase

1. Creer un projet Supabase Free dans une region europeenne.
2. Dans `SQL Editor`, coller puis executer `supabase/migrations/0001_initial_schema.sql`.
3. Dans `Authentication > Providers > Email`, activer les liens magiques. Garder la confirmation d'email activee.
4. Dans `Project Settings > API`, relever `Project URL`, la cle `anon` et la cle `service_role`.
5. Creer votre premier compte par lien magique, puis promouvoir ce compte dans le SQL Editor :

```sql
update public.profiles
set role = 'admin'
where id = 'UUID_DE_VOTRE_UTILISATEUR';
```

Ne jamais mettre la cle `service_role` dans le navigateur, dans Git ou dans une capture d'ecran.

## 2. Creer Vercel

1. Creer un compte Vercel Hobby et importer ce depot Git.
2. Dans `Settings > Environment Variables`, ajouter les quatre valeurs de `.env.example` pour les environnements `Production` et `Preview`.
3. Pour la premiere mise en ligne, renseigner l'URL Vercel finale dans `PUBLIC_APP_ORIGIN`, sans slash final. Remplacer cette valeur par le domaine final lorsqu'il sera connecte.
4. Deployer. Vercel execute `npm run build` automatiquement.

## 3. Verifier apres le premier deploiement

1. Ouvrir `https://votre-url/health` : la reponse doit etre `status: ok`.
2. Ouvrir `https://votre-url/ready` : la reponse doit etre `status: ready` et `configured: true`. Cette route verifie aussi que Supabase et la table `anecdotes` repondent.
3. Soumettre une anecdote publique : elle doit etre creee avec le statut `pending` dans la table `anecdotes`.
4. Depuis Supabase, passer une anecdote de test a `published` et definir `published_at = now()` ; elle doit remplacer les cartes de demonstration du fil.

```sql
update public.anecdotes
set moderation_status = 'published', published_at = now()
where id = 'UUID_DE_L_ANECDOTE';
```

5. Verifier qu'aucune cle n'apparait dans `View Source`, dans les requetes navigateur ou dans le depot.

## 4. Limites de cette beta

- Vercel Hobby est destine a un projet personnel non commercial. Ne pas activer publicite ou partenariats avant de passer a Vercel Pro.
- Supabase Free peut mettre le projet en pause apres une periode d'inactivite. Exporter la base regulierement avant toute campagne ou test important.
- Les votes, signalements, profil connecte et carnet prive restent encore locaux dans cette version. Ne pas presenter ces donnees comme synchronisees entre appareils avant le branchement complet de l'authentification et des routes Supabase.
- Toute anecdote publique reste `pending` jusqu'a une validation humaine. Le filtrage automatique masque quelques motifs evidents, mais ne remplace pas la moderation.

## Verifications locales

```bash
bun scripts/verify-static.mjs
bun run test
```

Pour verifier des valeurs de production avant de les copier dans Vercel :

```bash
SUPABASE_URL=https://votre-projet.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_ANON_KEY=... \
PUBLIC_APP_ORIGIN=https://votre-domaine.example \
bun run check:env
```
