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

Ne jamais mettre la cle `secret` ou `service_role` dans le navigateur, dans Git ou dans une capture d'ecran.

## 2. Creer Vercel

1. Creer un compte Vercel Hobby et importer ce depot Git. Le deploiement Production doit suivre la branche `main`.
2. Dans `Settings > General > Node.js Version`, choisir `24.x`. Le projet le declare aussi dans `package.json` et `.nvmrc`. Vercel detecte automatiquement cette version pour les fonctions Node officielles ; ne pas ajouter de champ `runtime` Node dans `vercel.json`.
3. Verifier dans `Settings > Environment Variables` que l'integration Supabase a synchronise `SUPABASE_URL`, `SUPABASE_SECRET_KEY` et `SUPABASE_PUBLISHABLE_KEY` pour `Production` et `Preview`. Les anciennes variables `SUPABASE_SERVICE_ROLE_KEY` et `SUPABASE_ANON_KEY` restent compatibles.
4. Pour la premiere mise en ligne, renseigner l'URL Vercel finale dans `PUBLIC_APP_ORIGIN`, sans slash final. Remplacer cette valeur par le domaine final lorsqu'il sera connecte.
5. A chaque push sur `main`, Vercel execute `npm run build`. Ce build lance les controles statiques et les contrats API avant d'autoriser le deploiement.

## 3. Verifier apres le premier deploiement

1. Ouvrir `https://votre-url/health` : la reponse doit etre `status: ok`.
2. Ouvrir `https://votre-url/ready` : la reponse doit etre `status: ready` et `configured: true`. `configuration_required` indique des variables manquantes, `credentials_invalid` une cle incorrecte et `schema_required` que la migration SQL n'a pas ete appliquee.
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
npm run build
```

Pour verifier des valeurs de production avant de les copier dans Vercel :

```bash
SUPABASE_URL=https://votre-projet.supabase.co \
SUPABASE_SECRET_KEY=... \
SUPABASE_PUBLISHABLE_KEY=... \
PUBLIC_APP_ORIGIN=https://votre-domaine.example \
npm run check:env
```

## Versions verifiees

- Node.js : `24.x` pour les builds et fonctions Vercel. Node 20 n'est plus compatible avec les bibliotheques Supabase recentes.
- Vercel Functions : runtime Node standard, sans package ou runtime Edge obsolete.
- Supabase : Postgres et Auth geres par la plateforme ; les routes API acceptent les nouvelles cles `publishable`/`secret` ainsi que les anciennes cles `anon`/`service_role`.
- Bun : facultatif pour le developpement local uniquement. Il n'est pas requis par la CI ni par Vercel.
