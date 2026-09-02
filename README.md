# K-ssenger

K-ssenger est une messagerie sociale moderne inspirée de l'esprit MSN Messenger, pensée pour 2026/2027.

## Vision

**MSN = âme · WhatsApp = fiabilité · Snapchat = fun · Telegram = puissance**

Le produit est centré sur la présence humaine : voir qui est en ligne, discuter, partager, se retrouver, utiliser le Wizz et retrouver une vraie personnalité sociale.

## Piliers produit

- Contacts et présence façon MSN
- Chat privé et groupes avec E2EE
- Wizz / Nudge comme interaction signature
- K-MAP : carte sociale et partage de position volontaire
- Moments : contenu éphémère
- Communautés : groupes et channels
- Profil personnalisable : pseudo, avatar, statut, musique

## K-MAP

K-MAP est une carte sociale opt-in intégrée à K-ssenger :

- position ponctuelle
- position live limitée dans le temps
- mode `Je viens vers toi`
- ETA et itinéraire
- `On se capte ?`
- Meet Mode
- groupes / road trips
- Ghost Mode
- précision exacte ou approximative selon le contact

La localisation est **OFF par défaut**. Aucun tracking caché ni partage permanent.

## Sécurité

- HTTPS/WSS en production
- authentification et autorisation côté serveur
- messages privés en E2EE
- aucune clé privée côté serveur
- aucun contenu plaintext dans les logs, push ou base serveur
- stockage sécurisé des clés sur iOS/Android
- blocage et révocation d'appareils
- contrôle fin de la confidentialité

## Statut

Ce dépôt sert de base de référence propre pour consolider le travail mobile, serveur, produit et UX réalisé sur K-ssenger.

Le code local développé par Agent-Kah devra être importé ici sans réécriture destructive.
