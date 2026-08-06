# Lancer la beta gratuite

Cette configuration utilise Vercel Hobby et Supabase Free. Elle convient pour une beta sans publicite, sans partenariat et sans donnees de patient. Le cout fixe est nul, hors nom de domaine.

## 1. Creer Supabase

1. Creer un projet Supabase Free dans une region europeenne.
2. Pour une nouvelle base, executer dans l'ordre les migrations `0001` a `0008`. Pour une base deja initialisee, executer les migrations manquantes jusqu'a `0008_private_note_management.sql` avant de deployer cette version. La migration `0006` programme la purge des anecdotes refusees, `0007` active les limites anti-abus par IP et par compte, et `0008` ajoute la gestion des liens et notes prives. Sans `0007`, les routes d'ecriture repondent volontairement `rate_limit_unavailable` au lieu d'accepter des actions non protegees.
3. Dans `Authentication > Providers > Email`, activer les comptes par e-mail et mot de passe. Garder la confirmation d'e-mail activee.
4. Dans `Authentication > URL Configuration`, definir `Site URL` sur `https://iladitquoi.vercel.app` et ajouter `https://iladitquoi.vercel.app/auth.html` aux Redirect URLs.
5. Avant d'ouvrir les inscriptions au public, configurer `Authentication > SMTP Settings` avec un fournisseur SMTP. Le serveur de test Supabase n'envoie qu'aux adresses autorisees de l'equipe et reste fortement limite.
6. Dans `Project Settings > API`, relever `Project URL`, la cle publishable et la cle secret si elles ne sont pas deja synchronisees par Vercel.
7. Creer votre premier compte, puis promouvoir ce compte dans le SQL Editor :

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'votre@email.fr');
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
4. Creer un compte e-mail, confirmer l'adresse, puis verifier la creation automatique de la ligne correspondante dans `profiles`.
5. Publier sans cocher l'anonymat : `author_id` doit contenir l'identifiant du compte et l'anecdote doit apparaitre dans le suivi de moderation du profil.
6. Depuis Supabase, passer une anecdote de test a `published`. La migration `0003` renseigne automatiquement `published_at` et l'anecdote apparait dans les fils Top et Nouvelles.

```sql
update public.anecdotes
set moderation_status = 'published'
where id = 'UUID_DE_L_ANECDOTE';
```

7. Promouvoir un compte `admin`, ouvrir `https://votre-url/admin`, puis traiter une anecdote `pending` et un signalement de test.
8. Verifier que seule la cle publishable apparait dans le navigateur. La cle secret ne doit apparaitre ni dans `View Source`, ni dans les requetes navigateur, ni dans le depot.
9. Refuser une anecdote liee a un compte, puis verifier que son auteur peut la supprimer depuis l'onglet `Moderation` de son profil. Dans `Supabase > Integrations > Cron`, les jobs `purge-refused-anecdotes-after-30-days` et `purge-expired-rate-limit-buckets` doivent etre actifs.
10. Verifier dans le SQL Editor que `private.rate_limit_buckets` existe. Les colonnes ne doivent contenir que des empreintes SHA-256 et jamais une adresse IP ou un identifiant de compte en clair.
11. Creer un lien prive depuis le carnet, verifier sa lecture, puis le revoquer. Le lien doit alors repondre `share_not_found`. Supprimer ensuite la note pour verifier la suppression en cascade de ses liens.

## 4. Limites de cette beta

- Vercel Hobby est destine a un projet personnel non commercial. Ne pas activer publicite ou partenariats avant de passer a Vercel Pro.
- Supabase Free peut mettre le projet en pause apres une periode d'inactivite. Exporter la base regulierement avant toute campagne ou test important.
- Les comptes, profils, avatars, soumissions publiques, carnet prive, votes et signalements sont synchronises avec Supabase. Les selections restent locales dans cette version.
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
