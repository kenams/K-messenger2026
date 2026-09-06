# K-ssenger â€” UX Specification

## Design direction

K-ssenger doit Ã©voquer K-ssenger sans copier ses assets ou marques protÃ©gÃ©es.

Principes :
- prÃ©sence trÃ¨s visible
- personnalisation assumÃ©e
- interface moderne, fluide, mobile-first
- K-Pulse toujours accessible
- statut et musique visibles sans surcharger
- sÃ©curitÃ© lisible, pas anxiogÃ¨ne

## Navigation principale

1. Contacts
2. Chats
3. K-MAP
4. Moments
5. Moi

## Onboarding

### Ã‰cran 1 â€” Welcome
- logo K-ssenger
- phrase : `La messagerie sociale qui remet la prÃ©sence au centre.`
- CTA CrÃ©er un compte
- CTA Se connecter

### Ã‰cran 2 â€” Compte
- email
- mot de passe
- confirmation

### Ã‰cran 3 â€” IdentitÃ©
- username unique
- display name
- avatar

### Ã‰cran 4 â€” PrÃ©sence
- statut initial
- bio courte
- musique optionnelle

### Ã‰cran 5 â€” Permissions
Demander au bon moment, jamais tout d'un bloc :
- notifications
- contacts si rÃ©ellement nÃ©cessaire
- micro/camÃ©ra au premier usage
- localisation au premier usage K-MAP

### Ã‰cran 6 â€” Protection
- explication E2EE
- appareil enregistrÃ©
- rÃ©cupÃ©ration de compte sÃ©parÃ©e des clÃ©s de chiffrement

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
- OccupÃ©s
- Absents
- Hors ligne

Carte contact :
- avatar
- indicateur prÃ©sence
- display name
- statut perso
- musique Ã©ventuelle
- indicateur K-MAP uniquement si partagÃ© volontairement

Actions :
- Message
- K-Pulse
- Appeler
- Voir profil
- K-MAP si autorisÃ©

## Chats

Liste :
- avatar
- nom
- aperÃ§u local dÃ©chiffrÃ©
- heure
- non lu
- statut envoyÃ©/livrÃ©/lu
- muted/pinned

Chat header :
- avatar
- nom
- statut
- badge verrou E2EE
- appel audio
- appel vidÃ©o
- menu

Composer :
- bouton +
- champ message
- emoji
- micro
- K-Pulse visible directement

Menu + :
- Photo
- VidÃ©o
- Document
- Position
- Position en direct
- Je viens vers toi
- Contact

Message bubble :
- rÃ©ponse
- Ã©dition
- suppression
- rÃ©action
- copier
- transfÃ©rer
- info livraison

## K-Pulse

Tap : Classic K-Pulse.

Long press :
- Classic
- Love
- Fire
- Troll

V1 peut n'activer que Classic.

Animation :
- shake contrÃ´lÃ©
- vibration/haptique
- son original
- fallback reduced motion

## K-MAP

Carte plein Ã©cran avec UI minimale.

Top controls :
- recherche lieu
- Ghost Mode
- recentrer

Map objects :
- Moi
- amis autorisÃ©s
- rendez-vous
- membres de trip autorisÃ©s

Bottom sheet sur contact :
- nom
- prÃ©sence
- distance approximative
- ETA si autorisÃ©
- Message
- K-Pulse
- Rejoindre

Primary FAB : `Partager / Se retrouver`

Actions :
- Envoyer ma position
- Position live
- Je viens vers toi
- On se capte ?
- CrÃ©er un road trip
- Meet Mode

Persistent sharing banner :
`Position partagÃ©e avec Sarah Â· 34 min restantes Â· ARRÃŠTER`

## Moments

Feed horizontal/vertical lÃ©ger, pas TikTok.

- amis uniquement par dÃ©faut
- story 24 h
- texte/photo/vidÃ©o
- reply privÃ©
- contrÃ´le audience
- viewer list

## Moi

Profil :
- avatar
- display name
- @username
- prÃ©sence
- bio
- musique

Sections :
- Compte
- ConfidentialitÃ©
- SÃ©curitÃ©
- Appareils
- Notifications
- Apparence
- Chats
- Stockage
- Aide
- Ã€ propos

## ConfidentialitÃ©

ContrÃ´les :
- qui voit ma prÃ©sence
- qui voit ma derniÃ¨re connexion
- qui voit mon avatar
- qui voit ma musique
- accusÃ©s de lecture
- qui peut m'ajouter
- qui peut m'appeler
- qui peut me K-Pulse
- qui peut m'inviter
- qui peut me voir sur K-MAP

## SÃ©curitÃ©

- appareils actifs
- rÃ©voquer appareil
- contacts vÃ©rifiÃ©s
- Safety Number / QR
- notifications changement de clÃ©
- verrouillage app
- biomÃ©trie
- vue claire E2EE

## Empty states

Contacts : `Aucun contact pour le moment. Ajoute quelqu'un et fais revivre ta liste.`

Chats : `Pas encore de conversation. Qui est en ligne ?`

K-MAP : `Personne n'est visible ici. Le partage de position reste privÃ© et volontaire.`

Moments : `Rien de neuf pour l'instant.`

## Accessibility

- labels screen reader
- font scaling
- touch targets suffisants
- contrastes
- Reduce Motion
- K-Pulse adaptÃ©
- ne jamais dÃ©pendre uniquement d'une couleur pour la prÃ©sence
