# Passage en production

## Etat du MVP

Le fil, les comptes, les avatars, les soumissions publiques, le carnet prive, les votes et les signalements utilisent Supabase. Les selections restent locales au navigateur dans cette version.

## Donner le role administrateur

Creer d'abord le compte depuis le site, puis executer cette requete dans le SQL Editor Supabase :

```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'votre@email.fr');
```

Verifier ensuite avec `select pseudonym, role from public.profiles;`. Le role `moderator` peut etre attribue de la meme maniere aux benevoles.

## Utiliser le back-office

Apres connexion, ouvrir `/admin`. La page n’est accessible qu’aux roles `moderator` et `admin`, et les API verifient ce role a chaque lecture ou decision.

- L’onglet **A valider** affiche les anecdotes publiques `pending`. Valider les publie ; refuser exige un message transmis a l’auteur connecte dans son suivi de moderation.
- L’onglet **Signalements** affiche les signalements non resolus. Conserver cloture le signalement. Masquer et refuser retire l’anecdote publiee du fil et cloture le signalement associe.
- Chaque validation ou refus est enregistre dans `moderation_decisions` avec le moderateur, le message auteur et la note interne facultative.
- L’auteur peut supprimer une anecdote refusee depuis son profil. Le job Supabase Cron `purge-refused-anecdotes-after-30-days` efface chaque jour celles dont le refus date de plus de 30 jours ; les decisions, votes et signalements associes sont supprimes en cascade.

## Architecture recommandee

- Frontend : HTML, CSS et JavaScript statiques servis par Vercel, avec routes publiques (`/`, `/profil`, `/admin`) et fonctions Node.js sous `/api/*`.
- Runtime : Node.js 24 pour les builds et fonctions Vercel. Le build execute les contrats statiques et API avant de deploiement.
- Donnees et authentification : Supabase Postgres et authentification par lien magique. Une session sera necessaire pour enregistrer un carnet, voter, signaler et suivre une moderation.
- Roles : `member`, `moderator`, `admin`. Les moderateurs et administrateurs voient la file commune et chaque decision est journalisee.
- Media et partage : les liens prives sont des jetons aleatoires, stockes hashes, revocables et eventuellement expires. Le texte de l'anecdote ne doit jamais apparaitre dans l'URL, dans le titre partage ni dans le message WhatsApp.

## Modele de donnees minimal

- `users` : pseudo, metier, niveau, xp, statut de compte.
- `anecdotes` : auteur, texte nettoye, metier, theme, visibilite, statut de moderation, dates.
- `votes` : utilisateur, anecdote, valeur. Une contrainte unique evite les votes multiples.
- `reports` : auteur du signalement, motif, statut, decision.
- `moderation_decisions` : moderateur, motif, horodatage, message de refus interne.
- `private_share_links` : anecdote, hash du jeton, expiration, revoke_at, compteur de lectures facultatif.

## Garanties avant ouverture publique

1. Filtre cote serveur pour emails, telephones et noms precedes d'une civilite, complete par une file de moderation humaine pour les autres identifiants. Le filtre ne suffit pas a rendre une publication sure.
2. Limites de debit par IP et compte pour les soumissions, votes, signalements et creation de liens. Ajouter CAPTCHA seulement quand le risque d'abus le justifie.
3. Journal d'audit, chiffrement en transit, sauvegardes, suppression de compte et export des donnees. Ne pas conserver les textes de brouillon dans des logs applicatifs.
4. Politique de confidentialite, CGU, regles de publication et canal de contact moderation accessibles avant toute soumission.
5. Tests automatises pour les permissions, l'anonymat, la revocation d'un lien prive, le filtrage PII et le cycle de moderation.

## Plan de livraison

1. Brancher l'authentification et le schema de donnees, puis migrer le carnet local vers les notes privees serveur.
2. Le workflow de moderation et le back-office pour les benevoles sont implementes. Ajouter ensuite les limites de debit et les alertes de volume.
3. Ajouter les liens courts prives et leur revocation, puis les mesures anti-abus.
4. Connecter votes, profils et XP a la base de donnees, avec metriques et alertes de moderation.
5. Faire une beta fermee avec des professionnels volontaires avant de vendre des emplacements partenaires.
