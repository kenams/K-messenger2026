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

```bash
cd apps/mobile
EXPO_PUBLIC_NEON_AUTH_URL='https://ep-long-smoke-b1c368ej.neonauth.c-5.eu-central-1.aws.neon.tech/kssenger/auth' \
EXPO_PUBLIC_NEON_DATA_API_URL='https://ep-long-smoke-b1c368ej.apirest.c-5.eu-central-1.aws.neon.tech/kssenger/rest/v1' \
EXPO_PUBLIC_KSSENGER_SOCKET_URL='https://kssenger-server.onrender.com' \
  npx expo export --platform web
npx eas deploy --prod --alias kssenger
```
