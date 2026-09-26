> ⚠️ HISTORIQUE — peut décrire un ancien état (E2EE/libsignal actif) qui ne correspond plus au runtime actuel. Voir `docs/PROJECT_STATE.md` pour l'état réel.

# K-ssenger — version web

## URL

**https://k-ssenger.expo.app** (EAS Hosting)

## Ce qui marche sur web

Tout le social : inscription/connexion, buddy list, présence + « now playing »,
contacts, K-Pulse (wizz), groupes, Moments, K-Feed, K-MAP, profil,
confidentialité, export/suppression de compte.

## Ce qui ne marche PAS sur web (volontaire)

Le **chat chiffré** (direct et groupe). libsignal est natif Android uniquement,
donc le composer reste verrouillé sur web — K-ssenger n'envoie jamais de texte
en clair. Le chat se démontre sur l'app Android. (Le déblocage web passe par le
device-linking `0020` — style WhatsApp Web — ou un libsignal WASM : V1.1.)

## ⚠️ Un réglage à faire une fois pour que la connexion web fonctionne

Neon Auth bloque les origines non déclarées (`403 INVALID_ORIGIN`). Ajouter le
domaine web à la liste blanche :

1. https://console.neon.tech/app/projects/late-flower-65059830/auth?tab=configuration
2. Section **Domains → Your trusted domains → Add new domain**
3. Coller `https://k-ssenger.expo.app` → **Add domain**

(Le domaine `https://kssenger-web.vercel.app` y est déjà mais le projet Vercel
n'est pas configuré pour servir le build ; l'hébergement actif est expo.app.)

## Redéployer le web

**Toujours utiliser la commande unique, jamais un `expo export` tapé à la main :**

```bash
npm run ship:web
```

Ce script (`scripts/ship-web.mjs`) est la seule source de vérité pour
`EXPO_PUBLIC_*` côté web : les valeurs (Neon, socket, Spotify, Last.fm, VAPID)
y sont câblées en dur avec fallback, `--clear` bust le cache Metro, puis il
enchaîne typecheck → tests serveur → static gate → export → deploy →
E2E contre la prod fraîche. Un `expo export` à la main (sans ce script) a
DÉJÀ cassé deux fois le « now playing » en prod en silence (variable oubliée
ou mal nommée, aucune erreur affichée) — c'est précisément le bug que ce
script existe pour rendre impossible. Si une nouvelle variable
`EXPO_PUBLIC_*` doit un jour être ajoutée, elle se rajoute dans
`scripts/ship-web.mjs` (objet `MOBILE_ENV`), pas dans une commande copiée
ailleurs.

`npm run ship:web -- --skip-deploy` relance juste la suite E2E contre la prod
actuelle, sans réexporter/redéployer.
