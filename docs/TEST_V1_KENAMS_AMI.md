# K-ssenger V1 — protocole de test (Kenams + 1 ami)

But : valider que l'app est **stable à 100 %** avant de prendre les comptes
Play Store / Apple. Coche chaque ligne. Si une ligne casse → note-la, on corrige.

## Setup

| | Web | Android |
|---|---|---|
| Accès | https://k-ssenger.expo.app | APK (dernier lien envoyé par mail / Telegram) |
| Ton compte | `kenams42+kssenger@gmail.com` / `Kss--f4BAds_-26` | idem, ou crée le tien |
| Compte ami | qu'il crée le sien (Créer un compte) | idem |

Après « Se connecter » sur web : la page se recharge toute seule (normal).

## A. Comptes & session

- [ ] Créer un compte (ami) — pseudo + nom + mail + mdp 8 car. min
- [ ] Se connecter / se déconnecter / se reconnecter (web **et** Android)
- [ ] Fermer l'app, rouvrir → toujours connecté
- [ ] Modifier le profil (pseudo, nom, statut, bio, avatar) → sauvegarde OK, visible chez l'ami

## B. Contacts

- [ ] Rechercher l'ami par @pseudo → il apparaît sous « Utilisateurs » avec « Ajouter »
- [ ] Envoyer la demande → l'ami la reçoit, l'accepte → vous êtes amis des 2 côtés
- [ ] Un contact déjà ami ne réapparaît PAS dans « Utilisateurs » quand on le cherche
- [ ] Mettre en favori / retirer des favoris
- [ ] Menu ⋯ → « Retirer le contact » puis le re-ajouter
- [ ] Menu ⋯ → « Bloquer » → l'autre ne peut plus rien envoyer → « Débloquer »

## C. Présence & now-playing

- [ ] Quand l'ami est connecté : pastille verte + « X en ligne » dans ta liste
- [ ] Changer son statut → visible chez l'autre en < 30 s
- [ ] « Partager ma musique » → titre visible chez l'ami

## D. K-Pulse (le wizz) — LE test signature

- [ ] Envoyer un K-Pulse à l'ami (bouton ⚡)
- [ ] Chez l'ami : **l'écran se fait envahir** — onde sonar, K central, flash, secousse, son
- [ ] Le nom de l'expéditeur s'affiche : « ⚡ K-Pulse — de [toi] »
- [ ] Ça marche depuis n'importe quel onglet (pas seulement Contacts)
- [ ] Sur Android : vibration
- [ ] Limite anti-spam : envoyer 5 pulses d'affilée → au bout d'un moment « refusé ou limité »

## E. Chat chiffré (Android uniquement — verrouillé sur web, normal)

- [ ] Ouvrir une conversation avec l'ami → envoyer un message texte → reçu
- [ ] Envoyer une photo, une vidéo → reçues, lisibles
- [ ] Accusés : « envoyé » puis « lu » (si activé dans Vie privée)
- [ ] Fermer / rouvrir l'app → l'historique est là
- [ ] Bandeau « 🔐 Signal/libsignal » visible en haut de la conversation
- [ ] Couper le wifi de l'ami → envoyer → il reçoit au retour du réseau

## F. Groupes

- [ ] Créer un groupe avec l'ami (＋ dans Groupes)
- [ ] L'ami le voit, envoie un message groupe (Android)
- [ ] Rôles : passer l'ami admin / le remettre membre
- [ ] Mute / ban / unban un membre
- [ ] Quitter le groupe

## G. Moments (stories 24 h)

- [ ] Publier un Moment texte (Amis / Proches / Public)
- [ ] Publier un Moment photo, un Moment vidéo
- [ ] L'ami voit tes Moments selon l'audience choisie
- [ ] Supprimer un Moment
- [ ] Après 24 h → le Moment disparaît

## H. K-Feed

- [ ] « + K-Clip » → choisir une vidéo → publiée (statut « en attente de modération »)
- [ ] **Annuler** le sélecteur de fichier (Échap) → le bouton se **réinitialise** (ne reste PAS bloqué sur « Envoi… »)
- [ ] Le clip reste privé tant que non validé

## I. K-Map

- [ ] « Partager ma position · 30 min » vers l'ami (précision approximative)
- [ ] L'ami voit ton partage dans « Partagé avec moi »
- [ ] « Révoquer » → l'ami ne voit plus rien
- [ ] « Ghost Mode · Tout révoquer »
- [ ] Le partage expire tout seul après 30 min

## J. Navigation & robustesse

- [ ] Bouton retour présent sur **tous** les écrans secondaires (profil, données, groupes, appareils liés, appairage, conversation)
- [ ] Bouton Retour du navigateur (web) → revient en arrière dans l'app, ne sort pas
- [ ] Bouton retour matériel (Android) → idem
- [ ] Rotation d'écran / petit écran / grand écran → rien ne déborde
- [ ] Laisser l'app ouverte 10 min → pas de crash, la présence tient
- [ ] Serveur endormi (1re action après 15 min d'inactivité) → ça rame ~30 s puis repart

## K. Compte & données

- [ ] « Créer mon export » → génère l'export
- [ ] Changer le mot de passe → reconnexion avec le nouveau
- [ ] (NE PAS tester la suppression de compte sauf sur un compte jetable)

---

## Verdict

Quand **toutes** les cases A→K passent sur web ET Android, sur **2 vrais téléphones**
avec 2 personnes différentes : c'est bon pour les comptes store.

Bugs connus à re-vérifier après le dernier build (corrigés côté code, à confirmer en vrai) :
1. Recherche : plus de « Ajouter » sur un contact déjà ami ✅ (vérifié web)
2. Libellé « Utilisateurs » rogné ✅ (corrigé)
3. Bouton « + K-Clip » bloqué si on ferme le sélecteur ✅ (corrigé, à confirmer sur device)
