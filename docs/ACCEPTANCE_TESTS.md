# K-ssenger â€” Cahier de recette

## Comptes de test

- Alice : utilisateur normal
- Bob : ami d'Alice
- Charlie : utilisateur non ami
- Device A1 : Android Alice
- Device B1 : iPhone Bob

## Authentification

- crÃ©ation de compte valide
- login valide
- token absent rejetÃ©
- token invalide rejetÃ©
- token expirÃ© rejetÃ©
- logout invalide la session attendue

## Appareils

- nouvel appareil enregistrÃ© pour son propriÃ©taire
- Alice ne peut pas utiliser l'identifiant d'appareil de Bob
- appareil rÃ©voquÃ© ne peut plus envoyer/recevoir
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
- Alice voit la mise Ã  jour
- notification `Bob vient de se connecter` respecte les prÃ©fÃ©rences
- Invisible ne fuit pas via typing, last_seen, K-MAP ou API auxiliaire

## E2EE 1:1

- Alice envoie `Salut Bob`
- Bob reÃ§oit et dÃ©chiffre localement
- DB ne contient pas `Salut Bob`
- logs serveur ne contiennent pas `Salut Bob`
- payload push ne contient pas `Salut Bob`
- mauvais appareil/clÃ© ne peut pas dÃ©chiffrer
- payload altÃ©rÃ© Ã©choue
- replay dÃ©tectÃ©/traitÃ© selon protocole
- message hors ordre gÃ©rÃ© selon protocole
- changement d'identitÃ© dÃ©clenche avertissement

## Autorisation conversation

- Charlie ne rejoint pas conversation Alice/Bob
- Charlie ne lit pas mÃ©tadonnÃ©es non autorisÃ©es
- Alice ne peut pas envoyer avec senderId=Bob
- Alice ne peut pas marquer pour Bob si action non autorisÃ©e

## FiabilitÃ©

- message avec clientMessageId dÃ©dupliquÃ©
- retry ne crÃ©e pas de doublon
- offline queue renvoie au retour rÃ©seau
- reconnexion restaure Ã©tat cohÃ©rent
- pagination conserve ordre
- sent/delivered/read cohÃ©rents

## K-Pulse

- Alice K-Pulse Bob
- Bob reÃ§oit vibration/animation autorisÃ©e
- rate limit bloque spam
- Bob peut muter K-Pulse
- blocage empÃªche K-Pulse
- Reduce Motion Ã©vite animation agressive
- DND est respectÃ© selon rÃ©glage

## K-MAP â€” permission

- localisation non demandÃ©e avant usage K-MAP
- refus permission laisse app fonctionnelle
- partage impossible sans consentement OS requis

## K-MAP â€” position ponctuelle

- Alice partage position avec Bob
- Bob la reÃ§oit
- Charlie ne la reÃ§oit pas
- blocage de Bob invalide l'accÃ¨s

## K-MAP â€” live location

- Alice dÃ©marre partage 15 min
- Bob voit indicateur live
- Alice voit banniÃ¨re avec destinataire + durÃ©e + STOP
- expiration coupe les updates
- arrÃªt manuel coupe immÃ©diatement
- reconnexion ne rÃ©active pas un partage rÃ©voquÃ©
- Bob ne peut pas prolonger le partage d'Alice

## K-MAP â€” prÃ©cision

- Bob autorisÃ© prÃ©cis reÃ§oit donnÃ©es prÃ©cises
- Charlie/recipient approximatif ne reÃ§oit jamais les coordonnÃ©es exactes dans son payload
- UI approximative n'est pas un simple floutage d'une donnÃ©e exacte reÃ§ue

## K-MAP â€” Ghost Mode

- activation stoppe partage live
- Meet Mode disparaÃ®t
- trip visibility disparaÃ®t
- prÃ©sence chat peut rester inchangÃ©e
- aucune API auxiliaire ne rÃ©vÃ¨le la derniÃ¨re position prÃ©cise

## K-MAP â€” On se capte ?

- Alice envoie demande
- aucune localisation Bob n'est utilisÃ©e avant acceptation
- Bob accepte
- ETA calculÃ©
- point de rencontre peut Ãªtre proposÃ©
- Alice/Bob peuvent stopper indÃ©pendamment
- refus ne rÃ©vÃ¨le pas position

## K-MAP â€” Road Trip

- seuls membres opt-in apparaissent
- admin de groupe ne peut pas forcer tracking
- membre peut quitter map sans quitter groupe
- outsider ne peut rejoindre via IDOR

## Push

- notification message gÃ©nÃ©rique sans plaintext
- notification contact/K-Pulse/appel respecte rÃ©glages
- token push rÃ©voquÃ©/supprimÃ© n'est plus utilisÃ©

## PiÃ¨ces jointes E2EE

- image chiffrÃ©e avant upload
- stockage ne contient que ciphertext
- clÃ© fichier transmise via message E2EE
- Bob dÃ©chiffre localement
- Charlie ne peut pas rÃ©cupÃ©rer/dÃ©chiffrer
- taille et MIME validÃ©s

## Voice notes

- enregistrement avec permission micro
- chiffrement client-side
- lecture destinataire
- offline/retry cohÃ©rent

## Groupes

- crÃ©ation groupe
- invitation/membership autorisÃ©es
- non-membre rejetÃ©
- admin/modÃ©ration respectÃ©es
- stratÃ©gie E2EE reconnue, pas de clÃ© AES permanente maison

## Appels

- signaling authentifiÃ©
- audio Alice/Bob
- fin d'appel propre
- outsider ne s'injecte pas dans signaling
- reconnexion rÃ©seau raisonnable

## ModÃ©ration

- block
- report
- mute
- report public/community
- rapport privÃ© E2EE ne joint une preuve qu'avec consentement explicite utilisateur

## Suppression compte

- suppression accessible dans l'app
- sessions rÃ©voquÃ©es
- push tokens supprimÃ©s
- appareils rÃ©voquÃ©s
- donnÃ©es supprimÃ©es/retentions documentÃ©es
- aucune promesse de supprimer les copies dÃ©jÃ  sauvegardÃ©es par des destinataires

## SÃ©curitÃ© finale

- cleartext HTTP/WSS interdit en prod
- aucun secret serveur embarquÃ© mobile
- aucun private key serveur
- aucun plaintext message cÃ´tÃ© serveur
- logs redacted
- RLS testÃ© directement
- dÃ©pendances auditÃ©es
- secret scan propre
- checklist MASVS mise Ã  jour

## ScÃ©nario de dÃ©mo obligatoire

1. Alice installe sur Android.
2. Bob installe sur iPhone.
3. CrÃ©ation comptes.
4. Alice ajoute Bob.
5. Bob accepte.
6. Bob passe online.
7. Alice reÃ§oit l'Ã©vÃ©nement de connexion.
8. Alice ouvre chat ðŸ”’ E2EE.
9. Alice envoie `Salut Bob`.
10. Serveur ne peut pas lire le contenu.
11. Bob rÃ©pond.
12. Alice envoie un K-Pulse.
13. Bob reÃ§oit animation/haptique.
14. Alice partage sa position live 15 min.
15. Bob voit Alice sur K-MAP.
16. Alice coupe le partage.
17. Bob perd immÃ©diatement l'accÃ¨s.
18. App fermÃ©e/rÃ©ouverte : historique et Ã©tats restent cohÃ©rents.
