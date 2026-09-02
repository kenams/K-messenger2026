# K-ssenger — Vision produit (Kenams, 02/09/2026)

K-ssenger n'est pas "MSN avec quelques fonctions modernes". C'est un mélange volontaire :

- **MSN** → identité, nostalgie, présence (le cœur visible du produit)
- **WhatsApp** → fiabilité et simplicité du quotidien
- **Snapchat** → fun, instantané, éphémère
- **Telegram** → puissance, gros groupes, canaux, souplesse

**MSN doit rester le cœur.** C'est ce qui différencie K-ssenger d'une énième messagerie.

## Le cœur K-ssenger (MSN)
Liste de contacts par statut, "X vient de se connecter", Disponible/Absent/Occupé/Invisible, Wizz, pseudos personnalisables, message perso, avatar, musique écoutée en temps réel, thèmes/skins (MSN 2003 / 7.5 / Live / K-ssenger 2027), historique des pseudos, sons de connexion.

**Wizz visuel** (signature K-ssenger) : plusieurs types — ⚡ classique, ❤️ Love, 🔥 Rage, 😂 Troll — vibration différente + réaction UI différente par type.

**La présence comme événement social** — pas juste des conversations : "🟢 Sarah vient de se connecter / 🎵 Sarah écoute Blinding Lights" → clic → conversation. Ressusciter le sentiment MSN : on se connecte pour voir qui est là, pas forcément pour parler à quelqu'un de précis.

Baseline produit : *"K-ssenger — See who's online again."*

## Greffé par-dessus (WhatsApp)
Messages privés, groupes, appels audio/vidéo, partage de fichiers, messages vocaux, accusés envoyé/reçu/lu, réponses à un message, réactions, multi-device, **E2EE**, sauvegardes sécurisées, blocage, signalement. Objectif : remplacer WhatsApp pour le quotidien.

## Greffé par-dessus (Snapchat)
Photos/vidéos éphémères, vue unique, stories, filtres, avatar K-ssenger façon Bitmoji. Streaks : **pas en V1**.

## Greffé par-dessus (Telegram)
Gros groupes, channels, bots, gros fichiers, username public, recherche, communautés, stickers, API K-ssenger, salons publics, mini-apps (plus tard). **Pas tout en V1** — risque de vouloir construire Discord+Telegram+WhatsApp+Snapchat+MSN en même temps et ne jamais rien sortir.

## Structure produit — 4 espaces seulement
1. **Contacts** — l'expérience MSN historique
2. **Chats** — conversations WhatsApp modernes
3. **Moments** — stories/éphémère façon Snapchat
4. **Communautés** — groupes/channels façon Telegram

Le profil est central (plus que sur WhatsApp) :
```
KAH 😎
🟢 Disponible
"On verra demain…"
🎵 2Pac — Changes
💻 connecté depuis Windows
🔥 humeur : tranquille
```

## E2EE = fondation invisible
L'utilisateur profite de K-ssenger sans avoir à comprendre la crypto. Le chiffrement (cf. `docs/CRYPTO_DECISION.md`) est sous tout ça, jamais un obstacle UX.

## Ordre de construction imposé
**Messagerie privée E2EE solide → contacts MSN/présence/Wizz → groupes → appels → Moments → communautés/channels.**

Objectif court terme : quelque chose d'assez solide pour être donné à ~10 personnes et utilisé tous les jours, avant d'élargir.
