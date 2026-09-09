# K-ssenger — Definition of Done

Une fonctionnalité (ou un correctif) n'est **pas** finie tant que :

## 1. Le code
- [ ] `npm run typecheck` vert
- [ ] `npm run test:server` vert (92+ tests)
- [ ] `npm run release:check-static` vert
- [ ] Zéro `console.log` / `TODO` / `debugger` ajouté
- [ ] Tout état de chargement a un `finally`
- [ ] Tout listener (socket, event) est nettoyé au démontage
- [ ] Les nouveaux boutons ont `accessibilityRole="button"` + un label

## 2. Le comportement — testé automatiquement
- [ ] Un test E2E couvre le nouveau flux (`apps/e2e/tests/*.spec.ts`)
- [ ] `npm run test:e2e` **100 % vert** contre la prod
- [ ] Aucun test existant cassé (pas de régression)

## 3. La livraison web
- [ ] `npm run ship:web` va au bout sans erreur
  (typecheck → tests → gate → deploy → wake → E2E)
- [ ] Vérif visuelle rapide sur https://k-ssenger.expo.app

## 4. Mobile (quand on y touche)
- [ ] Le même flux marche sur l'APK (test manuel sur device réel)
- [ ] **APK diffusé UNIQUEMENT quand le web est 100 % E2E-vert** (règle Kenams)

## 5. La trace
- [ ] Commit clair (quoi + pourquoi)
- [ ] `MEMORY.md` / mémoire à jour si décision non triviale

---

## La règle d'or

**« Est-ce que le web est carré ? »** = **`npm run test:e2e` est vert.**
Pas « ça a l'air de marcher ». Pas « j'ai cliqué un peu ». Vert, ou pas fini.

Chaque bug trouvé par un humain qui n'était pas couvert par un test →
on ajoute d'abord le test qui le reproduit, puis on corrige. Le filet se
resserre à chaque itération, il ne se relâche jamais.
