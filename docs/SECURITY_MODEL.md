# K-ssenger — Security & Privacy Model

## Non négociable

- Aucun plaintext de message privé sur serveur, DB, push, logs ou analytics.
- Aucun secret E2EE privé côté serveur.
- Pas de protocole cryptographique improvisé.
- Chaque appareil possède sa propre identité cryptographique.
- HTTPS/WSS en production.
- Authentification et autorisation sont distinctes de l'E2EE.
- RLS et autorisations Socket.IO empêchent IDOR/spoofing.

## Authentification serveur

Le serveur vérifie le JWT Supabase. `userId` est dérivé du token. Tout `senderId`, `ownerId` ou équivalent envoyé par le client est ignoré pour l'autorisation.

Un deviceId doit appartenir à l'utilisateur authentifié, être actif et non révoqué.

## Autorisation

Helpers centraux recommandés :

- requireAuthenticatedUser
- requireActiveDevice
- requireConversationMember
- requireContactPermission
- requireNotBlocked
- requireLocationSharePermission

Toute route/socket sensible passe par ces contrôles.

## E2EE

Le protocole de session doit être une implémentation reconnue et testée. Les primitives libsodium peuvent être utilisées pour des fonctions auxiliaires mais ne justifient pas une implémentation maison non auditée de X3DH/Double Ratchet.

Safety Number/fingerprint/QR, changement d'identité et révocation appareil doivent être visibles à l'utilisateur.

## Pièces jointes

Fichier chiffré côté client avec clé aléatoire par fichier. Seul le ciphertext est uploadé. La clé/données de déchiffrement voyagent dans le canal E2EE.

## Push

Payload générique : aucune copie du message. Le client récupère le ciphertext et déchiffre localement.

## K-MAP

Localisation OFF par défaut. Consentement explicite, durée limitée, précision choisie, destinataires choisis. Ghost Mode coupe immédiatement les partages actifs.

Un utilisateur bloqué perd immédiatement l'accès aux partages de localisation. Une session expirée n'est plus consultable. Pas d'historique permanent de trajectoire par défaut.

La localisation n'est jamais incluse dans analytics ou logs applicatifs détaillés.

## Logging

Redaction obligatoire : JWT, passwords, tokens, private keys, recovery keys, message plaintext, attachment keys, coordonnées GPS précises.

## Tests minimum

- token absent/invalide/expiré
- spoof senderId
- device d'un autre utilisateur
- device révoqué
- conversation non membre
- utilisateur bloqué
- RLS direct
- modification présence d'autrui
- accès position après expiration
- accès position après blocage
- Ghost Mode
- ciphertext tamper/wrong key/replay/out-of-order
- recherche automatisée de plaintext dans DB/logs/push

## Référentiel

OWASP MASVS/MASTG comme baseline mobile. Avant ouverture publique importante : revue de sécurité externe recommandée.
