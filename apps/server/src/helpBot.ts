/**
 * K-Bot help engine: answers questions about using K-ssenger.
 *
 * Honest scope: this is a hand-written FAQ matched by keywords — not a
 * language model (no paid AI API is wired). Every answer below only describes
 * what the app actually does today; when the question is not covered it says
 * so and points to the support address instead of guessing.
 */

export const SUPPORT_EMAIL = 'kahdigital42@gmail.com';
export const WEB_URL = 'https://k-ssenger.expo.app';
export const APK_URL = 'https://k-ssenger.expo.app/kssenger-latest.apk';

type Topic = { id: string; keywords: RegExp; answer: string };

const MENU = [
  'Je suis K-Bot, l\'assistant de K-ssenger. Demande-moi par exemple :',
  '• « Comment connecter Last.fm ? » ou « Spotify »',
  '• « Comment installer l\'application ? » / « iPhone »',
  '• « Comment ajouter un ami ? » / « groupes » / « Découvrir »',
  '• « K-Pulse », « K-Live », « K-Map », « Moments »',
  '• « Confidentialité », « notifications », « supprimer mon compte »',
  '• « Mot de passe oublié », « pseudo », « avatar », « thème »',
  `Un bug ou une question que je ne connais pas ? Écris à ${SUPPORT_EMAIL}.`,
  'Note : ce que tu m\'écris est lisible par le serveur (pour que je puisse te répondre). N\'envoie pas d\'infos sensibles dans cette conversation.',
].join('\n');

const TOPICS: Topic[] = [
  {
    id: 'lastfm',
    keywords: /last\.?\s?fm|scrobbl|deezer|apple music|youtube music|musique automatique/i,
    answer: [
      '🎵 Connecter Last.fm (marche avec Deezer, Apple Music, YouTube Music, Spotify…) :',
      '1. Crée un compte gratuit sur last.fm/join si tu n\'en as pas.',
      '2. Sur Last.fm, dans les réglages « Applications », connecte ton service de musique : c\'est lui qui envoie tes écoutes à Last.fm (le « scrobble »).',
      '3. Dans K-ssenger : onglet Moi → ⚙︎ Modifier mon profil → Musique en cours → « Synchro automatique » → champ « Pseudo Last.fm » → Enregistrer.',
      'Ensuite ta musique se met à jour toute seule. Pour arrêter : « Retirer Last.fm » au même endroit.',
      'Si rien ne s\'affiche : vérifie que ton pseudo Last.fm est exact et que tes écoutes apparaissent bien sur ton profil Last.fm.',
    ].join('\n'),
  },
  {
    id: 'spotify',
    keywords: /spotify/i,
    answer: [
      '🎧 Connecter Spotify :',
      'Onglet Moi → ⚙︎ Modifier mon profil → Musique en cours → « Synchro automatique » → Spotify → Connecter.',
      'Important : Spotify Premium est nécessaire (Spotify refuse la lecture en direct aux comptes gratuits).',
      'Une fois connecté, tu peux aussi contrôler la lecture (play/pause/suivant) depuis l\'app.',
      'Pas de Premium ? Utilise Last.fm à la place : demande-moi « Last.fm ».',
    ].join('\n'),
  },
  {
    id: 'music',
    keywords: /\b(musique|morceau|son|écoute|ecoute|now playing|titre en cours)\b/i,
    answer: [
      '🎶 Partager ta musique : appuie sur « Partager ma musique » sous ton nom (onglet Moi) pour la saisir à la main,',
      'ou active la synchro automatique : demande-moi « Last.fm » (tous services) ou « Spotify » (Premium).',
    ].join('\n'),
  },
  {
    id: 'delete',
    keywords: /supprim|effacer|export|mes données|mes donnees|rgpd|quitter l'app|désinscri|desinscri/i,
    answer: [
      '🗂️ Tes données :',
      '• Exporter : onglet Moi → « Exporter mon compte ».',
      '• Supprimer : onglet Moi → « Supprimer mon compte » (définitif : ton profil et tes messages sont effacés).',
      '• Se déconnecter simplement : Moi → « Se déconnecter ».',
    ].join('\n'),
  },
  {
    id: 'bug',
    keywords: /\bbug|problème|probleme|marche pas|ne fonctionne|plante|crash|erreur|bloqué|bloque|\blent\b|n'arrive pas|signaler/i,
    answer: [
      '🛠️ Un souci ? Pour qu\'on le corrige vite, envoie-nous à ' + SUPPORT_EMAIL + ' :',
      '• ce que tu faisais, et ce qui s\'est passé ;',
      '• ton téléphone (modèle, Android/iPhone/navigateur) ;',
      '• si possible une capture d\'écran.',
      'En attendant, ferme complètement l\'app et rouvre-la : ça règle une partie des problèmes de connexion.',
    ].join('\n'),
  },
  {
    id: 'install',
    keywords: /install|\bapk\b|télécharg|telecharg|avoir l'appli|obtenir l'appli|lien de l'app/i,
    answer: [
      '📱 Installer K-ssenger sur Android :',
      `1. Ouvre ce lien sur ton téléphone : ${APK_URL}`,
      '2. Télécharge, puis ouvre le fichier. Android te demandera d\'autoriser l\'installation depuis cette source : accepte.',
      '3. Si l\'installation échoue, désinstalle d\'abord une ancienne version de K-ssenger, puis réinstalle.',
      `Sur ordinateur ou iPhone : ${WEB_URL}`,
    ].join('\n'),
  },
  {
    id: 'ios',
    keywords: /iphone|ios|apple|ipad|mac\b/i,
    answer: [
      '🍎 Il n\'y a pas encore d\'application iPhone.',
      `Tu peux utiliser K-ssenger dans le navigateur : ${WEB_URL}`,
      'Astuce : dans Safari, « Partager » → « Sur l\'écran d\'accueil » pour l\'avoir comme une appli.',
    ].join('\n'),
  },
  {
    id: 'account',
    keywords: /mot de passe|mdp|password|connexion|connecter|se connect|inscri|compte|login|identifiant/i,
    answer: [
      '🔑 Compte et connexion :',
      '• Inscription : e-mail + mot de passe (8 caractères minimum), puis tu choisis ton pseudo.',
      '• Connexion : avec ton pseudo (ou ton e-mail) + mot de passe.',
      '• Mot de passe oublié : bouton « Mot de passe oublié » sur l\'écran de connexion, tu reçois un lien par e-mail (pense à vérifier les spams).',
      `• Toujours bloqué ? Écris à ${SUPPORT_EMAIL} avec ton pseudo.`,
    ].join('\n'),
  },
  {
    id: 'username',
    keywords: /pseudo|nom affiché|nom affiche|username/i,
    answer: [
      '🏷️ Ton pseudo : 3 à 32 caractères, lettres minuscules, chiffres, point et underscore (ex. alex_92).',
      'Pour le nom affiché, le statut, la bio et l\'avatar : onglet Moi → ⚙︎ Modifier mon profil.',
    ].join('\n'),
  },
  {
    id: 'contacts',
    keywords: /\bami(e|s|es)?\b|contact|ajouter|inviter|demande d'ami|trouver (quelqu|une? personne)/i,
    answer: [
      '👥 Ajouter quelqu\'un :',
      '1. Onglet Contacts → champ « Rechercher un contact ou @pseudo ».',
      '2. Tape son @pseudo, puis « Ajouter » : la personne reçoit ta demande.',
      '3. Dès qu\'elle accepte, vous pouvez vous écrire et voir votre présence.',
      'Tu peux aussi la faire rejoindre un groupe ou lui envoyer le lien de l\'app.',
    ].join('\n'),
  },
  {
    id: 'groups',
    keywords: /groupe|découvrir|decouvrir|rejoindre|salon|communauté|communaute/i,
    answer: [
      '💬 Groupes :',
      '• Créer : onglet Chats → Groupes → nouveau groupe, puis invite tes contacts.',
      '• Rôles : propriétaire et modérateurs peuvent promouvoir, mettre en sourdine ou bannir.',
      '• Trouver des groupes publics : onglet Découvrir → choisis un thème (Foot, Dev, IA, Musique, Gaming…) → « Rejoindre ».',
      'Les messages de groupe sont chiffrés comme les messages directs.',
    ].join('\n'),
  },
  {
    id: 'kpulse',
    keywords: /k-?pulse|wizz|nudge|secou|tremble|⚡/i,
    answer: '⚡ K-Pulse (le « wizz » façon MSN) : dans une conversation avec un contact, envoie un K-Pulse pour faire trembler son écran. La personne peut le refuser dans ses réglages de Vie privée (« qui peut me wizzer »).',
  },
  {
    id: 'live',
    keywords: /k-?live|\blive\b|vidéo|video|caméra|camera|micro|appel|diffus/i,
    answer: [
      '🎥 K-Live : diffuse ou rejoins un live en vidéo, ou en « audio seulement » si tu ne veux pas de caméra.',
      'Quand l\'app demande l\'accès à la caméra / au micro, accepte. Si tu as refusé par erreur : réglages du téléphone → Applications → K-ssenger → Autorisations.',
    ].join('\n'),
  },
  {
    id: 'map',
    keywords: /k-?map|position|localisation|carte|ghost|géoloc|geoloc/i,
    answer: [
      '📍 K-Map : tu choisis toi-même avec qui partager ta position.',
      '• « Partager ma position · 30 min » : partage temporaire, précision approximative.',
      '• « Ghost Mode » : révoque tous les partages d\'un coup.',
      'Il n\'y a pas de suivi en arrière-plan : si tu ne partages pas, personne ne voit où tu es.',
    ].join('\n'),
  },
  {
    id: 'moments',
    keywords: /moment|statut|status|story|stories|24 ?h|publier|épingl|epingl/i,
    answer: [
      '✨ Moments : des publications visibles 24 h par tes amis (onglet Moments).',
      '• Tes amis peuvent réagir (❤️ 🔥 😂 😮 👏).',
      '• Tu peux épingler un Moment pour qu\'il reste affiché.',
      '• Ton statut (texte court) se change dans Moi → ⚙︎ Modifier mon profil.',
    ].join('\n'),
  },
  {
    id: 'privacy',
    keywords: /confidentialit|vie privée|vie privee|chiffr|e2ee|sécur|secur|privé|prive|qui voit|bloquer/i,
    answer: [
      '🔒 Vie privée :',
      '• Tes messages avec tes amis et dans les groupes sont chiffrés de bout en bout : le serveur ne les lit pas.',
      '• Limite à connaître : pas encore de « forward secrecy » (le mécanisme qui protège les anciens messages si une clé fuit).',
      '• Mes échanges avec toi (K-Bot) sont lisibles par le serveur, sinon je ne pourrais pas te répondre.',
      '• Réglages : onglet Moi → Vie privée (qui voit ta présence, ta musique, qui peut te wizzer).',
    ].join('\n'),
  },
  {
    id: 'notifications',
    keywords: /notif|alerte|vibr|\bpush\b|badge/i,
    answer: [
      '🔔 Notifications :',
      '• Accepte la demande de notification quand l\'app la propose.',
      '• Sinon : réglages du téléphone → Applications → K-ssenger → Notifications → autoriser.',
      '• Le son et la vibration peuvent être réglés par contact (K-Tone).',
    ].join('\n'),
  },
  {
    id: 'style',
    keywords: /avatar|thème|theme|couleur|apparence|sombre|dark|mode nuit|look/i,
    answer: [
      '🎨 Personnaliser :',
      '• Avatar : Moi → ⚙︎ Modifier mon profil → Avatar (peau, cheveux, tenue, silhouette).',
      '• Couleur d\'identité : au même endroit.',
      '• Thème et mode clair/sombre : onglet Moi → sections « Apparence » et « Thème ».',
    ].join('\n'),
  },
  {
    id: 'price',
    keywords: /prix|gratuit|payant|abonnement|pub\b|publicité|publicite|combien/i,
    answer: 'K-ssenger est gratuit, sans publicité. Aucune carte bancaire demandée.',
  },
];

const GREETING = /^(salut|bonjour|bonsoir|coucou|hello|hey|yo|hi|wesh|allo|allô)\b/i;
const MENU_WORDS = /\b(menu|aide|help|assistance|questions?|quoi faire|comment ça marche|comment ca marche|fonctionnalit|que sais-tu|tu sais faire)\b/i;
const THANKS = /\b(merci|thanks|thx|top|parfait|nickel|super)\b/i;

/** Returns the help answer for a plain-text user message. */
export function craftHelpReply(input: string): string {
  const text = input.trim();
  if (!text) return MENU;

  // A pure greeting / "menu" request gets the menu; real questions win over a greeting prefix.
  const topic = TOPICS.find((t) => t.keywords.test(text));
  if (topic) return topic.answer;
  if (GREETING.test(text) || MENU_WORDS.test(text)) return MENU;
  if (THANKS.test(text) && text.length < 60) return 'Avec plaisir ! Je suis là si tu as une autre question 🙂 (tape « menu » pour la liste).';

  return [
    'Je n\'ai pas la réponse à ça pour le moment (je ne suis pas une vraie IA, juste un assistant à réponses préparées).',
    `Tu peux reformuler avec un mot-clé (Last.fm, groupes, notifications…) ou écrire à ${SUPPORT_EMAIL}.`,
    'Tape « menu » pour voir tout ce que je sais expliquer.',
  ].join('\n');
}

export const HELP_TOPIC_IDS = TOPICS.map((t) => t.id);
