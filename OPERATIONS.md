# Passage en production

## Etat du MVP

`finalized.html` et `profile.html` sont un prototype navigable. Les interactions de vote, de signalement et le carnet prive sont locales au navigateur. Ce comportement est utile pour valider le produit, mais il ne constitue pas une application de production : les donnees ne sont pas partagees entre appareils et un lien court ne peut pas proteger une anecdote sans serveur.

## Architecture recommandee

- Frontend : HTML, CSS et JavaScript statiques servis par Vercel, avec routes publiques (`/`, `/profil`) et fonctions Node.js sous `/api/*`.
- Runtime : Node.js 24 pour les builds et fonctions Vercel. Le build execute les contrats statiques et API avant de deploiement.
- Donnees et authentification : Supabase Postgres et authentification par lien magique. Une session sera necessaire pour enregistrer un carnet, voter, signaler et suivre une moderation.
- Roles : `member`, `moderator`, `admin`. Les moderateurs ne voient que la file qui leur est attribuee ; chaque action est journalisee.
- Media et partage : les liens prives sont des jetons aleatoires, stockes hashes, revocables et eventuellement expires. Le texte de l'anecdote ne doit jamais apparaitre dans l'URL, dans le titre partage ni dans le message WhatsApp.

## Modele de donnees minimal

- `users` : pseudo, metier, niveau, xp, statut de compte.
- `anecdotes` : auteur, texte nettoye, metier, theme, visibilite, statut de moderation, dates.
- `votes` : utilisateur, anecdote, valeur. Une contrainte unique evite les votes multiples.
- `reports` : auteur du signalement, motif, statut, decision.
- `moderation_decisions` : moderateur, motif, horodatage, message de refus interne.
- `private_share_links` : anecdote, hash du jeton, expiration, revoke_at, compteur de lectures facultatif.

## Garanties avant ouverture publique

1. Filtre cote serveur pour noms, prenoms, numeros, emails et adresses, complete par une file de moderation humaine. Le filtre bloque ou met en attente, il ne suffit pas a rendre une publication sure.
2. Limites de debit par IP et compte pour les soumissions, votes, signalements et creation de liens. Ajouter CAPTCHA seulement quand le risque d'abus le justifie.
3. Journal d'audit, chiffrement en transit, sauvegardes, suppression de compte et export des donnees. Ne pas conserver les textes de brouillon dans des logs applicatifs.
4. Politique de confidentialite, CGU, regles de publication et canal de contact moderation accessibles avant toute soumission.
5. Tests automatises pour les permissions, l'anonymat, la revocation d'un lien prive, le filtrage PII et le cycle de moderation.

## Plan de livraison

1. Brancher l'authentification et le schema de donnees, puis migrer le carnet local vers les notes privees serveur.
2. Implementer le workflow de moderation et le back-office pour les benevoles.
3. Ajouter les liens courts prives et leur revocation, puis les mesures anti-abus.
4. Connecter votes, profils et XP a la base de donnees, avec metriques et alertes de moderation.
5. Faire une beta fermee avec des professionnels volontaires avant de vendre des emplacements partenaires.
