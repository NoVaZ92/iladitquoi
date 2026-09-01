# Passage en production

## Etat du MVP

Le fil, les comptes, les avatars, les soumissions publiques, le carnet prive, les votes, les signalements et les selections des comptes connectes utilisent Supabase. Les selections visiteur restent locales jusqu’a la connexion.

Le thème Signal Nuit est partagé par toutes les pages via `theme.css`. Toute évolution visuelle doit conserver les couleurs sémantiques distinctes pour les validations, attentes et refus de modération.

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
- L’onglet **Signalements** affiche les signalements non résolus avec un motif structuré. Conserver clôture le signalement. **Masquer du fil** retire une anecdote déjà publiée, clôture le signalement associé et exige un message pour son auteur.
- Chaque validation, refus ou retrait est enregistré dans `moderation_decisions` avec le modérateur, le message auteur et la note interne facultative. Les auteurs connectés retrouvent les dernières décisions dans leur profil.
- L’auteur peut supprimer toute anecdote publique depuis son profil, y compris une publication validée. Le job Supabase Cron `purge-refused-anecdotes-after-30-days` efface chaque jour les soumissions refusées depuis plus de 30 jours ; un retrait après publication reste disponible au propriétaire jusqu’à sa suppression manuelle.
- Les publications, notes privees, votes, signalements et liens prives sont limites par IP et par compte. Les sujets sont haches par HMAC avant stockage dans `private.rate_limit_buckets`, puis les compteurs expires sont purges quotidiennement.

## Architecture recommandee

- Frontend : HTML, CSS et JavaScript statiques servis par Vercel, avec routes publiques (`/`, `/profil`, `/admin`) et fonctions Node.js sous `/api/*`.
- Runtime : Node.js 24 pour les builds et fonctions Vercel. Le build execute les contrats statiques et API avant de deploiement.
- Donnees et authentification : Supabase Postgres et comptes e-mail avec mot de passe, confirmation d’adresse et reinitialisation de mot de passe. Une session sera necessaire pour enregistrer un carnet, voter, signaler et suivre une moderation.
- Roles : `member`, `moderator`, `admin`. Les moderateurs et administrateurs voient la file commune et chaque decision est journalisee.
- Media et partage : les liens prives sont des jetons aleatoires, stockes hashes, revocables et eventuellement expires. Le texte de l'anecdote ne doit jamais apparaitre dans l'URL, dans le titre partage ni dans le message WhatsApp.

## Suppression et export

- Le bouton `Télécharger mes données` du profil produit un JSON avec le compte, les anecdotes, votes, signalements, liens privés, sélections synchronisées et notifications de modération, ainsi que le cache local éventuellement présent.
- Le bouton `Supprimer mon compte` exige la saisie de `SUPPRIMER`, efface les contenus et l'avatar, puis supprime le compte Supabase. Les anciennes décisions de modération gardent leur historique mais ne sont plus reliées à un compte supprimé.
- Tester la suppression avec un compte non administrateur avant ouverture. Une suppression de compte ne doit jamais être effectuée depuis le SQL Editor pour un utilisateur réel, sauf procédure de support documentée.
- Les sélections sont synchronisées pour les comptes connectés. Les sélections créées avant connexion restent disponibles localement puis sont reprises automatiquement si elles correspondent encore à une anecdote publiée.

## Modele de donnees minimal

- `users` : pseudo, metier, niveau, xp, statut de compte.
- `anecdotes` : auteur, texte nettoye, metier, theme, visibilite, statut de moderation, dates.
- `votes` : utilisateur, anecdote, valeur. Une contrainte unique evite les votes multiples.
- `reports` : auteur du signalement, motif, statut, decision.
- `moderation_decisions` : moderateur, motif, horodatage, message de refus interne.
- `private_share_links` : anecdote, hash du jeton, expiration, revoke_at, compteur de lectures facultatif.

## Garanties avant ouverture publique

1. Filtre cote serveur pour emails, telephones et noms precedes d'une civilite, complete par une file de moderation humaine pour les autres identifiants. Le filtre ne suffit pas a rendre une publication sure.
2. Limites de debit par IP et compte pour les soumissions, votes, signalements et creation de liens. Elles sont actives ; ajouter CAPTCHA seulement si les alertes de volume montrent qu’elles ne suffisent plus.
3. Journal d'audit, chiffrement en transit, sauvegardes, suppression de compte et export des donnees. Le profil propose deja un export JSON et une suppression definitive ; tester ces parcours avec un compte de test avant l'ouverture publique. Ne pas conserver les textes de brouillon dans des logs applicatifs.
4. Politique de confidentialite, CGU, regles de publication et canal de contact moderation accessibles avant toute soumission.
5. Tests automatises pour les permissions, l'anonymat, la revocation d'un lien prive, le filtrage PII et le cycle de moderation.

## Plan de livraison

1. Brancher l'authentification et le schema de donnees, puis migrer le carnet local vers les notes privees serveur.
2. Le workflow de moderation, le back-office et les limites de debit sont implementes. Ajouter ensuite les alertes de volume.
3. Les liens courts prives, leur revocation et la suppression des notes du carnet sont implementes.
4. Connecter votes, profils et XP a la base de donnees, avec metriques et alertes de moderation.
5. Faire une beta fermee avec des professionnels volontaires avant de vendre des emplacements partenaires.
