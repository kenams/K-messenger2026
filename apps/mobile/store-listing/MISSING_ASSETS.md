# Ce qu'il manque encore pour soumettre sur Play Console

Ces éléments ne sont PAS générés par l'agent (design graphique) — à fournir
par Kenams ou un agent design séparé.

## Assets graphiques obligatoires
- [ ] **Icône app** haute définition : 512×512 px, PNG 32-bit, fond opaque
- [ ] **Feature graphic** : 1024×500 px (bannière affichée en haut de la fiche Play)
- [ ] **Screenshots téléphone** : minimum 2, format 16:9 ou 9:16, entre 320px
      et 3840px sur le plus petit côté (recommandé : 3-8 captures montrant
      chat 1:1, groupe, statut/profil)

## Optionnel mais recommandé
- [ ] Screenshots tablette 7"/10" (si un jour ciblé)
- [ ] Vidéo promo YouTube (30-120s)

## Autre prérequis Play Console (côté Kenams)
- [ ] Compte développeur Google Play créé et payé (25$, en cours par Kenams)
- [ ] **Héberger `privacy-policy.md` sur une URL publique** (ex. page sur
      kah-digital.ch) — Play Console exige une URL, pas un fichier
- [ ] Choisir la catégorie de l'app (Communication) et remplir le
      questionnaire "Data safety" du Play Console (base : voir
      `privacy-policy.md` pour ce qui est collecté)
- [ ] Créer la liste des testeurs internes/fermés (emails Gmail) pour le
      "closed testing track"
- [ ] Répondre au questionnaire "Content rating" (IARC) dans Play Console

## État du build
- Un build de production (.aab) a été lancé via `eas build --platform android
  --profile production` mais a échoué : quota Android gratuit EAS épuisé pour
  ce mois (reset prévu le 01/10/2026). Relancer la commande après cette date,
  ou upgrader le plan EAS pour débloquer immédiatement.
