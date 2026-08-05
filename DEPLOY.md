# Lancer la beta gratuite

Cette configuration utilise Vercel Hobby et Supabase Free. Elle convient pour une beta sans publicite, sans partenariat et sans donnees de patient. Le cout fixe est nul, hors nom de domaine.

## 1. Creer Supabase

1. Creer un projet Supabase Free dans une region europeenne.
2. Pour une nouvelle base, executer dans l'ordre `supabase/migrations/0001_initial_schema.sql`, puis `supabase/migrations/0002_authentication.sql`. Pour la base v0.0.1 deja initialisee, executer uniquement `0002_authentication.sql`.
3. Dans `Authentication > Providers > Email`, activer les comptes par e-mail et mot de passe. Garder la confirmation d'e-mail activee.
4. Dans `Authentication > URL Configuration`, definir `Site URL` sur `https://iladitquoi.vercel.app` et ajouter `https://iladitquoi.vercel.app/auth.html` aux Redirect URLs.
5. Avant d'ouvrir les inscriptions au public, configurer `Authentication > SMTP Settings` avec un fournisseur SMTP. Le serveur de test Supabase n'envoie qu'aux adresses autorisees de l'equipe et reste fortement limite.
6. Dans `Project Settings > API`, relever `Project URL`, la cle publishable et la cle secret si elles ne sont pas deja synchronisees par Vercel.
7. Creer votre premier compte, puis promouvoir ce compte dans le SQL Editor :

```sql
update public.profiles
set role = 'admin'
where id = 'UUID_DE_VOTRE_UTILISATEUR';
```

Ne jamais mettre la cle `secret` ou `service_role` dans le navigateur, dans Git ou dans une capture d'ecran.

### Activer la connexion Google

1. Dans Google Auth Platform, creer un client OAuth de type `Web application`.
2. Ajouter `https://iladitquoi.vercel.app` dans `Authorized JavaScript origins`.
3. Copier depuis `Supabase > Authentication > Providers > Google` l'URL de callback du projet, puis l'ajouter telle quelle dans `Authorized redirect URIs` chez Google.
4. Copier le Client ID et le Client Secret Google dans le fournisseur Google de Supabase, puis activer ce fournisseur.
5. Configurer l'audience Google sur `External`. Tant que l'application OAuth reste en mode test, ajouter chaque testeur dans la liste Google des utilisateurs de test.

Au premier acces Google, Supabase cree automatiquement le compte. Le site demande ensuite un pseudonyme et le metier avant d'ouvrir le profil.

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
4. Creer un compte e-mail, confirmer l'adresse, puis verifier la creation automatique de la ligne correspondante dans `profiles`.
5. Se connecter avec Google et finaliser le pseudonyme et le metier.
6. Publier sans cocher l'anonymat : `author_id` doit contenir l'identifiant du compte et l'anecdote doit apparaitre dans le suivi de moderation du profil.
7. Depuis Supabase, passer une anecdote de test a `published` et definir `published_at = now()` ; elle doit remplacer les cartes de demonstration du fil.

```sql
update public.anecdotes
set moderation_status = 'published', published_at = now()
where id = 'UUID_DE_L_ANECDOTE';
```

8. Verifier que seule la cle publishable apparait dans le navigateur. La cle secret ne doit apparaitre ni dans `View Source`, ni dans les requetes navigateur, ni dans le depot.

## 4. Limites de cette beta

- Vercel Hobby est destine a un projet personnel non commercial. Ne pas activer publicite ou partenariats avant de passer a Vercel Pro.
- Supabase Free peut mettre le projet en pause apres une periode d'inactivite. Exporter la base regulierement avant toute campagne ou test important.
- Les comptes, profils et soumissions publiques sont synchronises avec Supabase. Les votes, signalements, selections et carnet prive restent encore locaux dans cette version.
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
- Supabase JS : `2.112.1`, avec Node 22 minimum et Node 24 utilise en production.
- esbuild : `0.28.1` pour produire le bundle navigateur local pendant le build Vercel.
- Bun : facultatif pour le developpement local uniquement. Il n'est pas requis par la CI ni par Vercel.
