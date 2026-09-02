# K-ssenger — Cahier de recette

## Comptes de test

- Alice : utilisateur normal
- Bob : ami d'Alice
- Charlie : utilisateur non ami
- Device A1 : Android Alice
- Device B1 : iPhone Bob

## Authentification

- création de compte valide
- login valide
- token absent rejeté
- token invalide rejeté
- token expiré rejeté
- logout invalide la session attendue

## Appareils

- nouvel appareil enregistré pour son propriétaire
- Alice ne peut pas utiliser l'identifiant d'appareil de Bob
- appareil révoqué ne peut plus envoyer/recevoir
- liste des appareils n'expose que les appareils du compte

## Contacts

- Alice recherche Bob
- Alice envoie une demande
- Bob accepte
- Charlie ne peut pas s'injecter dans leur relation
- suppression contact fonctionne
- blocage fonctionne dans les deux sens applicables

## Presence

- Bob passe Disponible
- Alice voit la mise à jour
- notification `Bob vient de se connecter` respecte les préférences
- Invisible ne fuit pas via typing, last_seen, K-MAP ou API auxiliaire

## E2EE 1:1

- Alice envoie `Salut Bob`
- Bob reçoit et déchiffre localement
- DB ne contient pas `Salut Bob`
- logs serveur ne contiennent pas `Salut Bob`
- payload push ne contient pas `Salut Bob`
- mauvais appareil/clé ne peut pas déchiffrer
- payload altéré échoue
- replay détecté/traité selon protocole
- message hors ordre géré selon protocole
- changement d'identité déclenche avertissement

## Autorisation conversation

- Charlie ne rejoint pas conversation Alice/Bob
- Charlie ne lit pas métadonnées non autorisées
- Alice ne peut pas envoyer avec senderId=Bob
- Alice ne peut pas marquer pour Bob si action non autorisée

## Fiabilité

- message avec clientMessageId dédupliqué
- retry ne crée pas de doublon
- offline queue renvoie au retour réseau
- reconnexion restaure état cohérent
- pagination conserve ordre
- sent/delivered/read cohérents

## Wizz

- Alice Wizz Bob
- Bob reçoit vibration/animation autorisée
- rate limit bloque spam
- Bob peut muter Wizz
- blocage empêche Wizz
- Reduce Motion évite animation agressive
- DND est respecté selon réglage

## K-MAP — permission

- localisation non demandée avant usage K-MAP
- refus permission laisse app fonctionnelle
- partage impossible sans consentement OS requis

## K-MAP — position ponctuelle

- Alice partage position avec Bob
- Bob la reçoit
- Charlie ne la reçoit pas
- blocage de Bob invalide l'accès

## K-MAP — live location

- Alice démarre partage 15 min
- Bob voit indicateur live
- Alice voit bannière avec destinataire + durée + STOP
- expiration coupe les updates
- arrêt manuel coupe immédiatement
- reconnexion ne réactive pas un partage révoqué
- Bob ne peut pas prolonger le partage d'Alice

## K-MAP — précision

- Bob autorisé précis reçoit données précises
- Charlie/recipient approximatif ne reçoit jamais les coordonnées exactes dans son payload
- UI approximative n'est pas un simple floutage d'une donnée exacte reçue

## K-MAP — Ghost Mode

- activation stoppe partage live
- Meet Mode disparaît
- trip visibility disparaît
- présence chat peut rester inchangée
- aucune API auxiliaire ne révèle la dernière position précise

## K-MAP — On se capte ?

- Alice envoie demande
- aucune localisation Bob n'est utilisée avant acceptation
- Bob accepte
- ETA calculé
- point de rencontre peut être proposé
- Alice/Bob peuvent stopper indépendamment
- refus ne révèle pas position

## K-MAP — Road Trip

- seuls membres opt-in apparaissent
- admin de groupe ne peut pas forcer tracking
- membre peut quitter map sans quitter groupe
- outsider ne peut rejoindre via IDOR

## Push

- notification message générique sans plaintext
- notification contact/Wizz/appel respecte réglages
- token push révoqué/supprimé n'est plus utilisé

## Pièces jointes E2EE

- image chiffrée avant upload
- stockage ne contient que ciphertext
- clé fichier transmise via message E2EE
- Bob déchiffre localement
- Charlie ne peut pas récupérer/déchiffrer
- taille et MIME validés

## Voice notes

- enregistrement avec permission micro
- chiffrement client-side
- lecture destinataire
- offline/retry cohérent

## Groupes

- création groupe
- invitation/membership autorisées
- non-membre rejeté
- admin/modération respectées
- stratégie E2EE reconnue, pas de clé AES permanente maison

## Appels

- signaling authentifié
- audio Alice/Bob
- fin d'appel propre
- outsider ne s'injecte pas dans signaling
- reconnexion réseau raisonnable

## Modération

- block
- report
- mute
- report public/community
- rapport privé E2EE ne joint une preuve qu'avec consentement explicite utilisateur

## Suppression compte

- suppression accessible dans l'app
- sessions révoquées
- push tokens supprimés
- appareils révoqués
- données supprimées/retentions documentées
- aucune promesse de supprimer les copies déjà sauvegardées par des destinataires

## Sécurité finale

- cleartext HTTP/WSS interdit en prod
- aucun secret serveur embarqué mobile
- aucun private key serveur
- aucun plaintext message côté serveur
- logs redacted
- RLS testé directement
- dépendances auditées
- secret scan propre
- checklist MASVS mise à jour

## Scénario de démo obligatoire

1. Alice installe sur Android.
2. Bob installe sur iPhone.
3. Création comptes.
4. Alice ajoute Bob.
5. Bob accepte.
6. Bob passe online.
7. Alice reçoit l'événement de connexion.
8. Alice ouvre chat 🔒 E2EE.
9. Alice envoie `Salut Bob`.
10. Serveur ne peut pas lire le contenu.
11. Bob répond.
12. Alice envoie un Wizz.
13. Bob reçoit animation/haptique.
14. Alice partage sa position live 15 min.
15. Bob voit Alice sur K-MAP.
16. Alice coupe le partage.
17. Bob perd immédiatement l'accès.
18. App fermée/réouverte : historique et états restent cohérents.
