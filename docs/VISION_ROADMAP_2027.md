# K-ssenger — Vision & Roadmap 2027

Contexte : positionnement validé 09/09/2026 — "l'app où tes vrais potes existent",
vibe MSN/Zenly + sécu Signal. Moat = E2EE + le vibe (Meta ne peut pas copier le
vibe sans détruire son modèle publicitaire ; Signal ne veut pas du fun). Voir
`project_kssenger_vision_2027.md` pour ce qu'on NE fait PAS : pas de feed public
algorithmique, pas de Discord complet (rôles/serveurs/permissions), rien qui
oblige à modérer un flux public.

Stack disponible pour juger le "buildable" : Expo React Native (mobile + web),
Node/Socket.io (temps réel), Neon Postgres + Neon Auth, NaCl box E2EE
(`lib/e2ee.ts`, pas de ratchet), LiveKit Cloud (audio/vidéo live), FCM (push
Android natif, pas d'iOS).

Chaque idée : mécanisme concret → pourquoi c'est différenciant → impact/effort.

---

## Fort impact / faible effort

## Statut d'implémentation (session du 2026-09-26)

Fait cette session : #1 (groupes) et #2. Reportées : #3 à #13 — voir la
raison sous chaque idée. Aucune n'a été bâclée : le budget de la session a
été concentré sur les deux items les plus sûrs/à plus fort ratio
valeur/risque plutôt que de livrer 13 features partielles ou cassées.
Priorité pour la prochaine session : #3 (K-Tone, effort faible, zéro
risque sécu) puis #6 (stickers groupe, réutilise le pipeline media
existant), avant d'attaquer le natif (#5) ou LiveKit (#8).

### 1. Indicateur de frappe — **implémenté cette session (DM + groupes)**
**Mécanisme** : côté client, chaque frappe dans le composer déclenche un event
socket `typing:update {conversationId, isTyping}` débouncé (envoi à la première
frappe, `isTyping:false` auto après 3s d'inactivité ou à l'envoi). Le serveur
valide l'appartenance à la conversation et le blocage (mêmes garde-fous que
`message:send`), puis relaie uniquement aux autres membres de la room
(`socket.to(...)`, jamais persisté, jamais loggé en clair). Le client affiche
"écrit…" à la place du statut de présence dans le header, avec auto-clear à 8s
si un signal d'arrêt se perd (app backgroundée).
**Différenciant** : c'est *le* signal MSN Messenger original — WhatsApp et
Snap l'ont, mais ici il est strictement éphémère et jamais stocké, cohérent
avec le narratif "K-ssenger ne peut rien lire", contrairement à WhatsApp/Meta
qui pourrait techniquement journaliser ce méta-signal.
**Statut** : DM fait, groupes pas encore (diffusion à N users au lieu d'1).

### 2. "Vu à HH:MM" au lieu de simples doubles-coches — **implémenté cette session (realtime seulement)**
**Mécanisme** : la table `receiptStore` a déjà `read_at` en timestamp exact —
il ne manque que l'affichage. Sur long-press ou tap du dernier message envoyé,
afficher "Vu à 14:32" au lieu de la simple coche bleue. Zéro nouvelle donnée
serveur, uniquement du rendu côté `MessageRow`.
**Différenciant** : WhatsApp cache l'heure exacte derrière un simple ✓✓ gris/bleu
(ambiguïté volontaire pour éviter la pression sociale) ; Messenger l'affiche
mais seulement au dernier message du fil. Ici, sur une appli "entre vrais
potes" plutôt qu'un outil pro, assumer la transparence horaire colle au vibe
MSN ("Untel a lu à...") sans être intrusif puisque déjà opt-in via
`privacy_settings.read_receipts`.

### 3. Son/vibration custom par contact ("K-Tone") — **reporté, prochaine priorité**
Raison : nécessite une migration Neon (`contacts.custom_sound_id`) et un
changement de `soundKit.ts` ; pas fait faute de budget de session restant,
pas pour une raison de risque — c'est l'item non fait le plus sûr à livrer
en premier la prochaine fois.

**Mécanisme** : ajouter `contacts.custom_sound_id` (nullable), un picker dans
l'écran profil du contact réutilisant `assets/sounds` existants + upload d'un
son court (<3s, même pipeline que la media privée). `soundKit.ts` choisit le
son en fonction de l'expéditeur au lieu d'un son unique global.
**Différenciant** : c'est le "sonnerie personnalisée" de l'ère Nokia/MSN
ramené en 2027 — Discord a des sons de notification globaux configurables,
mais pas par ami individuel ; WhatsApp n'a aucune personnalisation sonore par
contact. Renforce le narratif "chaque pote a sa signature" plutôt qu'un flux
homogène.

### 4. "Vu récemment" sur K-Map au lieu du point live seul — **reporté**
Raison : pas fait faute de budget de session ; effort réel faible (juste du rendu sur un snapshot déjà en base), donc bon candidat pour une prochaine petite session après #3.

**Mécanisme** : K-Map est déjà foreground-only par design (invariant sécu). Au
lieu de faire disparaître le pion dès que l'app passe en arrière-plan,
persister la dernière position connue + timestamp, et l'afficher grisée avec
un badge d'ancienneté ("il y a 12 min") tant qu'elle n'est pas rafraîchie.
Aucune extension du tracking réel — juste un dernier snapshot déjà en base,
mieux exploité côté UI.
**Différenciant** : c'est exactement le liant qui manquait à Zenly (le
"dernier vu ici" plutôt qu'un silence total) sans réintroduire le tracking
permanent que Zenly a fini par abandonner sous pression vie privée — on garde
le foreground-only comme argument de confiance plutôt que de le sacrifier pour
la fraîcheur des données.

---

## Fort impact / effort moyen

### 5. Widget écran d'accueil (roadmap #4) — **reporté, hors scope de cette session**
Raison : nécessite du code natif Android (`AppWidgetProvider`) / iOS (`WidgetKit`) via config plugin Expo, au-delà de ce qui est vérifiable proprement sans build natif réel ; à traiter dans une session dédiée.

**Mécanisme** : module natif Expo (config plugin + widget Android
`AppWidgetProvider` / iOS `WidgetKit`) affichant tête d'un pote favori +
now-playing Last.fm (déjà synchronisé serveur) + dernier Moment vu, rafraîchi
par push silencieux FCM. Nécessite un vrai dev natif (le plus gros morceau
technique de cette liste), mais aucune nouvelle donnée serveur : tout existe
déjà (`lastfm_username`, Moments, presence).
**Différenciant** : c'est littéralement la mécanique qui a fait Locket (100M
installs sur un seul widget) — matérialiser la présence d'un pote sur l'écran
d'accueil au lieu de devoir ouvrir une app est un boucle virale prouvée, que
Snap et Meta n'ont jamais réussi à répliquer avec le même effet nostalgique.

### 6. Stickers/mèmes custom par groupe — **reporté**
Raison : pas fait faute de budget ; réutilise le pipeline media privé déjà en place, bon candidat pour la session suivante après #3/#4.

**Mécanisme** : table `group_stickers` (conversationId, uploaderId, mediaId),
upload via le pipeline media privé déjà en place (autorisation-aware signed
upload), limite 5-8 par groupe. `QUICK_REACTIONS` reste le set global fixe ;
un long-press sur la barre de réactions dans un groupe ouvre en plus la
tray des stickers maison de ce groupe précis.
**Différenciant** : Discord a des emojis custom par serveur mais nécessite un
"boost" ou une gestion d'admin lourde ; ici c'est 1 tap, sans rôle ni
permission, cohérent avec le refus explicite d'un "Discord complet".

### 7. "K-Rewind" — digest hebdo entre potes — **reporté, arbitrage confidentialité à trancher par Kenams**
Raison : arbitrage obligatoire (calcul client-only vs remontée serveur) noté dans ce document lui-même ; non implémenté par prudence plutôt que de décider unilatéralement de casser l'invariant E2EE.

**Mécanisme** : job cron serveur (dimanche soir) qui agrège par utilisateur :
contact le plus wizzé/K-Pulsé de la semaine, mot ou emoji le plus utilisé dans
ses groupes (comptage côté serveur sur le texte déjà déchiffré... **attention**
— voir note sécurité ci-dessous —, Moment le plus vu. Envoi via push FCM +
écran dédié dans l'app.
**Note sécurité obligatoire** : avec l'E2EE actuel le serveur ne voit jamais le
texte en clair, donc le "mot le plus utilisé" ne peut PAS être calculé côté
serveur sans casser l'invariant E2EE. Version réaliste : calculer ce digest
**côté client** (le téléphone a les clés, agrège localement sur 7 jours) et ne
remonter au serveur que le résultat final agrégé/anonyme si on veut un
classement social, ou le garder 100% local si on ne veut rien remonter.
**Différenciant** : Spotify Wrapped a prouvé la mécanique du rituel annuel qui
fait revenir — ici en hebdo et centré sur les relations plutôt que sur un
produit à vendre (musique), aucune appli de messagerie ne fait ce rituel de
retour actuellement.

### 8. K-Rooms audio — salon vocal éphémère par groupe — **reporté**
Raison : réutilise LiveKit existant mais nécessite un test audio multi-device réel pour valider proprement l'ouverture/fermeture de room ; pas vérifiable de façon fiable dans cette session.

**Mécanisme** : réutilise directement l'infra LiveKit déjà branchée pour
K-Live (transport prouvé), mais scope le salon à un groupe existant plutôt
qu'à un broadcast public un-à-plusieurs. Un membre du groupe "ouvre" un salon
(room LiveKit nommée par `conversationId`), les autres membres voient un
bandeau "🎙️ salon ouvert" dans le groupe et rejoignent en 1 tap ; le salon se
ferme automatiquement quand tout le monde part.
**Différenciant** : c'est le "Discord Stage" ou "Twitter Spaces" mais borné à
un cercle fermé déjà existant — donc sans avoir à gérer la découverte
publique ni la modération de flux public que l'équipe a explicitement exclue.

---

## Idées audacieuses — mécaniques sociales pas déjà vues ailleurs

### 9. "Présence fantôme" (Ghost Sync) — statut d'activité partagée en temps réel sans contenu — **reporté**
Raison : mécanique de coïncidence serveur-side nouvelle, pas assez cadrée (fenêtre de tolérance, anti-abus) pour être livrée sans plus de design préalable.

**Mécanisme** : au lieu d'un simple "en ligne/hors ligne", un canal de
présence enrichi et strictement éphémère (jamais stocké, socket only, comme le
typing indicator) : "en train d'écouter [morceau]", "en train de regarder ton
Moment", "ouvre l'app en même temps que toi" (coïncidence détectée
serveur-side sur deux sockets actifs simultanément sur la même conversation,
sans lire le contenu). Le point fort : un signal "vous êtes tous les deux là,
maintenant" qui pousse à ouvrir le chat pile au bon moment, sans notification
intrusive — juste un petit halo/pulse sur l'avatar du contact dans la liste.
**Différenciant** : Discord a un statut d'activité (jeu en cours) mais jamais
de signal de coïncidence temporelle entre deux personnes précises ; BeReal
force un moment simultané imposé par le serveur — ici c'est organique,
détecté, jamais forcé. C'est une mécanique de "synchronicité" qui n'existe
nulle part sous cette forme.

### 10. "Capsule à retardement" — message chiffré qui ne se déverrouille qu'à une condition sociale, pas temporelle — **reporté**
Raison : le verrou est UX (pas crypto) et doit être annoncé honnêtement dans l'app — demande un vrai passage design avant de coder l'écran, pas fait faute de budget de session.

**Mécanisme** : un message ou média est envoyé chiffré avec une condition de
déverrouillage définie par l'expéditeur au moment de l'envoi : "à débloquer
quand vous serez tous les deux en ligne en même temps", "à débloquer dans X
jours", "à débloquer quand le destinataire aura répondu à un message
précédent". Techniquement : le contenu est déjà chiffré end-to-end côté
client (comme aujourd'hui) ; la "condition" est juste un flag côté serveur qui
retient l'affichage (pas le déchiffrement — la clé est déjà côté client, donc
c'est un verrou UX, pas un vrai verrou crypto, à annoncer honnêtement dans
l'app pour ne pas sur-promettre une sécurité qu'on n'a pas).
**Différenciant** : Snap a le "disparaît après lecture" (contrainte de
disparition), BeReal a la contrainte temporelle imposée globalement ; ici
c'est l'expéditeur qui choisit une condition sociale et personnalisée par
message — aucune appli ne laisse composer sa propre règle de déverrouillage
par message.

### 11. "Chambre" de profil vivante et générative (MySpace 2.0, roadmap #6, poussé plus loin) — **reporté, hors scope de cette session**
Raison : plus gros morceau visuel de la liste (Skia/Reanimated + passage design premium complet, pas un placeholder) ; à traiter dans une session dédiée avec vérification navigateur/app réelle.

**Mécanisme** : au-delà d'un simple thème/couleur d'accent (déjà présent via
`accentColor`), une page de profil "chambre" composée de blocs que le user
arrange librement : dernier morceau écouté (déjà dispo via Last.fm), citation
du jour, mini-collage des 3 derniers Moments, mur de mots doux laissés par des
potes (façon "guestbook" MySpace, modéré en 1:1 seulement — pas un mur public,
donc pas de charge de modération de masse). Rendu en React Native
`Skia`/`Reanimated` pour un vrai effet "vivant" (parallax léger, petites
animations d'ambiance selon l'heure du jour).
**Différenciant** : les profils modernes (Instagram, Discord) sont des
templates figés et identiques pour tous ; le pari MySpace historique — la
personnalisation comme expression de soi — n'a jamais été repris sérieusement
depuis. Ici, contrairement à MySpace, le guestbook reste strictement
ami-à-ami donc pas de mur public à modérer.

### 12. "Écho" — reformulation IA optionnelle d'un message avant envoi, jamais du contenu qui transite en clair — **reporté, arbitrage confidentialité à trancher par Kenams**
Raison : arbitrage opt-in IA tiers explicitement noté dans ce document ; non implémenté par prudence plutôt que d'activer sans confirmation explicite de Kenams sur le wording/consentement exact de la fuite de confidentialité que ça implique.

**Mécanisme** : bouton optionnel "reformuler" dans le composer qui appelle un
LLM (Claude API) **avant chiffrement** — donc le texte en clair ne quitte
l'appareil que vers l'API IA (opt-in explicite, désactivable), jamais vers le
serveur K-ssenger lui-même. Usage : adoucir un message envoyé sur le coup de
la colère, traduire à la volée pour un pote non-francophone, résumer un pavé
avant de l'envoyer dans un groupe. Doit rester strictement à la demande de
l'utilisateur, jamais automatique, et clairement indiqué que ce texte-là (et
seulement celui-là, sur demande) transite en clair vers un tiers.
**Différenciant** : cohérent avec la roadmap validée ("IA de groupe opt-in,
résume/traduis"), mais poussé au niveau du message individuel plutôt que du
groupe entier — aucune appli E2EE grand public ne propose une reformulation
pré-chiffrement avec ce niveau de transparence sur la fuite de confidentialité
que ça implique.

### 13. Statuts éphémères 24h amis-only, chiffrés ("K-Statut") — **reporté**
Raison : demande une nouvelle table avec purge TTL serveur (cron/`expires_at`) et un écran dédié complet (chiffrement + design premium) — plus gros morceau que #3/#4/#6, à prioriser après ceux-ci.

**Mécanisme** : contenu chiffré comme un Moment classique mais avec TTL 24h
côté serveur (purge automatique, pas juste un flag de masquage côté client),
visible uniquement aux contacts acceptés, défilement chronologique simple
(pas d'algo de tri) exactement comme K-Feed aujourd'hui.
**Différenciant** : à ne pas confondre avec un Feed public — reste amis-only
et chrono, donc conforme à l'exclusion explicite du "Feed public
algorithmique". Ce qui manque ailleurs : Instagram/Snap Stories sont
lisibles côté serveur (modération de masse oblige) ; ici la disparition à 24h
ET le chiffrement bout-en-bout réel sont combinés, ce qu'aucun concurrent
mainstream ne fait puisqu'ils ont besoin de scanner le contenu pour modérer à
l'échelle — un cercle fermé de vrais potes rend ce compromis inutile.

---

## Fort impact / effort élevé (structurants)

### 14. iOS + parité E2EE Swift
Non négociable avant tout lancement store grand public (déjà noté "non
optionnel" dans la vision validée). Bloque la moitié du marché tant que ce
n'est pas fait. Aucun raccourci : il faut réimplémenter `nacl.box` côté
natif Swift (ou passer par une lib WASM partagée), plus le pendant APNs du
pipeline push FCM actuel.

### 15. Vrai forward secrecy (Double Ratchet) au lieu du NaCl box statique
**Mécanisme actuel** : une paire de clés X25519 fixe par appareil, jamais
renouvelée. **Limite** : si une clé privée fuit un jour, tout l'historique
déjà échangé redevient rétroactivement lisible — pas de "forward secrecy".
Passer à un vrai ratchet (à la Signal) nécessite de renouveler des clés
éphémères à chaque message/session et de gérer le rattrapage hors-ligne.
**Différenciant / honnêteté** : ce n'est pas différenciant en soi (Signal le
fait déjà) — c'est ce qui manque pour pouvoir dire "aussi sûr que Signal"
sans mentir. Effort élevé, pas urgent pour un cercle d'amis fermé, mais
proposé ici pour que le choix de ne pas le faire reste un choix assumé et pas
un oubli.

---

## Honnêteté

Le facteur limitant reste la distribution, pas les idées (déjà noté dans la
vision validée : 100% non prouvé). Ce document classe des features
buildables avec le stack actuel ; il ne remplace pas le test à 2 téléphones
physiques qui reste la vraie prochaine étape critique selon
`docs/PROJECT_STATE.md`. L'idée #7 (K-Rewind) et l'idée #12 (Écho) impliquent
chacune un arbitrage de confidentialité explicite à trancher par Kenams avant
tout build (calcul client-only vs remontée serveur ; opt-in IA tiers) — ne
pas les implémenter sans cette décision consciente.
