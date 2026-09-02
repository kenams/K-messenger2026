# K-ssenger — UX Specification

## Design direction

K-ssenger doit évoquer MSN sans copier ses assets ou marques protégées.

Principes :
- présence très visible
- personnalisation assumée
- interface moderne, fluide, mobile-first
- Wizz toujours accessible
- statut et musique visibles sans surcharger
- sécurité lisible, pas anxiogène

## Navigation principale

1. Contacts
2. Chats
3. K-MAP
4. Moments
5. Moi

## Onboarding

### Écran 1 — Welcome
- logo K-ssenger
- phrase : `La messagerie sociale qui remet la présence au centre.`
- CTA Créer un compte
- CTA Se connecter

### Écran 2 — Compte
- email
- mot de passe
- confirmation

### Écran 3 — Identité
- username unique
- display name
- avatar

### Écran 4 — Présence
- statut initial
- bio courte
- musique optionnelle

### Écran 5 — Permissions
Demander au bon moment, jamais tout d'un bloc :
- notifications
- contacts si réellement nécessaire
- micro/caméra au premier usage
- localisation au premier usage K-MAP

### Écran 6 — Protection
- explication E2EE
- appareil enregistré
- récupération de compte séparée des clés de chiffrement

## Contacts

Header :
- avatar utilisateur
- nom
- statut
- recherche
- ajout contact

Sections :
- Favoris
- En ligne
- Occupés
- Absents
- Hors ligne

Carte contact :
- avatar
- indicateur présence
- display name
- statut perso
- musique éventuelle
- indicateur K-MAP uniquement si partagé volontairement

Actions :
- Message
- Wizz
- Appeler
- Voir profil
- K-MAP si autorisé

## Chats

Liste :
- avatar
- nom
- aperçu local déchiffré
- heure
- non lu
- statut envoyé/livré/lu
- muted/pinned

Chat header :
- avatar
- nom
- statut
- badge verrou E2EE
- appel audio
- appel vidéo
- menu

Composer :
- bouton +
- champ message
- emoji
- micro
- Wizz visible directement

Menu + :
- Photo
- Vidéo
- Document
- Position
- Position en direct
- Je viens vers toi
- Contact

Message bubble :
- réponse
- édition
- suppression
- réaction
- copier
- transférer
- info livraison

## Wizz

Tap : Classic Wizz.

Long press :
- Classic
- Love
- Fire
- Troll

V1 peut n'activer que Classic.

Animation :
- shake contrôlé
- vibration/haptique
- son original
- fallback reduced motion

## K-MAP

Carte plein écran avec UI minimale.

Top controls :
- recherche lieu
- Ghost Mode
- recentrer

Map objects :
- Moi
- amis autorisés
- rendez-vous
- membres de trip autorisés

Bottom sheet sur contact :
- nom
- présence
- distance approximative
- ETA si autorisé
- Message
- Wizz
- Rejoindre

Primary FAB : `Partager / Se retrouver`

Actions :
- Envoyer ma position
- Position live
- Je viens vers toi
- On se capte ?
- Créer un road trip
- Meet Mode

Persistent sharing banner :
`Position partagée avec Sarah · 34 min restantes · ARRÊTER`

## Moments

Feed horizontal/vertical léger, pas TikTok.

- amis uniquement par défaut
- story 24 h
- texte/photo/vidéo
- reply privé
- contrôle audience
- viewer list

## Moi

Profil :
- avatar
- display name
- @username
- présence
- bio
- musique

Sections :
- Compte
- Confidentialité
- Sécurité
- Appareils
- Notifications
- Apparence
- Chats
- Stockage
- Aide
- À propos

## Confidentialité

Contrôles :
- qui voit ma présence
- qui voit ma dernière connexion
- qui voit mon avatar
- qui voit ma musique
- accusés de lecture
- qui peut m'ajouter
- qui peut m'appeler
- qui peut me Wizz
- qui peut m'inviter
- qui peut me voir sur K-MAP

## Sécurité

- appareils actifs
- révoquer appareil
- contacts vérifiés
- Safety Number / QR
- notifications changement de clé
- verrouillage app
- biométrie
- vue claire E2EE

## Empty states

Contacts : `Aucun contact pour le moment. Ajoute quelqu'un et fais revivre ta liste.`

Chats : `Pas encore de conversation. Qui est en ligne ?`

K-MAP : `Personne n'est visible ici. Le partage de position reste privé et volontaire.`

Moments : `Rien de neuf pour l'instant.`

## Accessibility

- labels screen reader
- font scaling
- touch targets suffisants
- contrastes
- Reduce Motion
- Wizz adapté
- ne jamais dépendre uniquement d'une couleur pour la présence
