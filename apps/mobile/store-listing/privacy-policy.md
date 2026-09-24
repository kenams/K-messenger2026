# Politique de confidentialité — K-ssenger

**Éditeur :** KAH Digital
**Contact :** contact@kah-digital.ch
**Dernière mise à jour :** 24 septembre 2026

## Ce que K-ssenger fait

K-ssenger est une application de messagerie personnelle. Les conversations
privées et de groupe sont chiffrées de bout en bout (protocole de type
Signal) : le contenu de vos messages est chiffré sur votre appareil avant
d'être transmis, et n'est déchiffré que sur l'appareil du ou des
destinataires. KAH Digital n'a pas techniquement accès au contenu de vos
messages.

## Données collectées

- **Compte** : identifiant de connexion (email ou téléphone selon la méthode
  choisie) nécessaire pour créer et retrouver votre compte.
- **Messages** : le contenu est chiffré de bout en bout et stocké chiffré
  sur nos serveurs le temps de la livraison (relais), de façon à pouvoir vous
  être délivré même si votre appareil est hors ligne.
- **Métadonnées techniques minimales** : identifiants d'appareil et jetons de
  notification push (Firebase Cloud Messaging), nécessaires pour vous
  envoyer une alerte quand vous recevez un message.
- **Position (optionnelle)** : uniquement si vous choisissez explicitement de
  partager votre position dans une conversation. Jamais collectée en arrière-plan.
- **Photos, vidéos, micro (optionnels)** : uniquement pour les médias que vous
  choisissez vous-même de partager (galerie, caméra, message vocal).

## Ce que nous ne faisons pas

- Nous ne lisons pas et ne pouvons pas lire le contenu de vos messages
  (chiffrement de bout en bout).
- Nous ne vendons aucune donnée à des tiers.
- Nous n'utilisons pas de traceurs publicitaires ni d'outils d'analytics
  tiers (pas de Google Analytics, Meta Pixel, etc.).
- Nous ne partageons pas vos contacts ou vos conversations avec des tiers.

## Services tiers utilisés

- **Firebase Cloud Messaging (Google)** : uniquement pour l'envoi des
  notifications push. Google traite un identifiant d'appareil technique,
  jamais le contenu de vos messages.
- **Hébergement infrastructure** : les données chiffrées transitent et sont
  relayées via nos serveurs (Render) et notre base de données (Neon), situés
  en Europe.

## Vos droits

Vous pouvez à tout moment demander la suppression de votre compte et de vos
données depuis l'application (Profil → Données du compte), ou en nous
contactant à contact@kah-digital.ch. Conformément au RGPD, vous disposez d'un
droit d'accès, de rectification et de suppression de vos données.

## Conservation des données

Les messages chiffrés sont supprimés de nos serveurs relais une fois livrés
à tous les destinataires. Les données de compte sont conservées tant que
votre compte est actif, et supprimées dans un délai raisonnable après
suppression de compte.

## Enfants

K-ssenger n'est pas destiné aux enfants de moins de 16 ans.

## Modifications

Cette politique peut être mise à jour ; toute modification substantielle
sera signalée dans l'application.

---

*Ébauche rédigée à partir de l'inspection du code (chiffrement E2EE présent
dans `src/lib/e2ee.ts` / `groupE2ee.ts`, notifications via Firebase
`google-services.json`, absence de SDK analytics tiers dans le code source).
À faire relire par un juriste avant publication définitive si le produit
gère des données sensibles supplémentaires plus tard.*
