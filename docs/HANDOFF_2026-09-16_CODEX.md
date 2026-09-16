# Reprise Codex — 16 septembre 2026

Complément à `HANDOFF_2026-09-16.md`. Le seul dépôt utilisé est
`C:\Users\kenam\Application-Projet-K\K-messenger2026`, branche
`feature/device-linking-scaffold`.

## Correction K-Pulse

- Reproduction dans Chromium : après une notification reçue en arrière-plan,
  le titre restait sur `⚡ ⚡ K-Pulse reçu !` au retour au premier plan.
- Cause : le timer arrêtait ses mises à jour quand le document redevenait visible,
  mais ne restaurait pas le titre laissé par son dernier passage.
- Correction dans `usePulseUntilSeen` : écoute de `visibilitychange`, restauration
  immédiate du titre et suppression de l'écouteur au nettoyage. Suppression de
  l'éclair ajouté en double par `MsnContactsScreen`.
- Régression ajoutée : `apps/e2e/tests/kpulse-attention.spec.ts`. L'événement entrant
  est injecté uniquement dans le navigateur de contrôle ; la visibilité est simulée
  explicitement pour être déterministe en mode headless. Le scénario existant à deux
  sessions continue de couvrir la livraison réelle.
- Captures du bandeau examinées en 1280 × 720 et 390 × 844.

## Vérifications et livraison

- État initial : pipeline sans déploiement réussi, 92 tests serveur et 22 E2E.
- `ship:web` complet terminé avec code 0 : typecheck, 92 tests serveur, gate statique,
  export Metro sans cache, EAS Hosting, réveil Render, suite E2E.
- Déploiement : `https://k-ssenger--69df9yuyqv.expo.app`, production
  `https://k-ssenger.expo.app`.
- Première suite après déploiement : 21 passages directs et 2 passages à la relance
  (smoke : timeout de fermeture du contexte ; Moments : attente du bouton Désépingler).
- Confirmation par un nouveau `ship:web -- --skip-deploy` complet : 92 tests serveur,
  gate statique et **23/23 E2E du premier coup**, sans échec, relance ni scénario ignoré.
  La suite inclut connexion, déconnexion/reconnexion et navigation dans les six onglets.
- Ces scénarios ne constituent pas une couverture exhaustive de toutes les fonctions
  ni une validation sur appareil Android. Aucun APK reconstruit.

## Environnement Windows

Node 22.23.2 échouait sur Render avec `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, alors que
curl utilisant le magasin Windows réussissait. Utiliser les certificats Windows
pour le processus de vérification résout le problème sans désactiver TLS :

```powershell
$env:NODE_OPTIONS='--use-system-ca'
npm.cmd run ship:web
```

## Reste ouvert

- Lenteur des onglets : le rendu conditionnel dans `apps/mobile/App.tsx` démonte
  les écrans. Le socket est un singleton partagé ; ce sont notamment les états,
  écouteurs et chargements des écrans qui repartent. Ne pas maintenir vidéo/GPS
  actifs en arrière-plan pour masquer cette lenteur.
- Le clignotement du titre reste attaché à l'écran Contacts ; cette correction
  ciblée ne change pas la portée du mécanisme.
- APK en retard et quota cloud épuisé, règles de la passation initiale inchangées.
- Les fichiers non suivis `apps/e2e/lea-after.png`, `lea-view.png` et
  `send-kpulse.mjs` étaient déjà présents au démarrage et ont été conservés.
