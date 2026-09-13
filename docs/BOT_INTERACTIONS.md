# Bots de test de Kenams

Le workflow `bot-interactions.yml` tourne sur `main` toutes les 30 minutes. Les bots se connectent pour un passage court : ils ne sont pas présents en continu entre deux passages. Le script utilise des réponses prédéfinies, sans modèle IA.

## Ce qui est exercé

- Messages directs, réponses aux messages récents de Kenams, accusés de lecture et réactions.
- Groupes réservés à Kenams et aux bots connus ; un seul bot répond par groupe.
- K-Pulse, statut personnalisé, musique, présence temporaire.
- Moments texte visibles par les amis et réaction au dernier Moment visible de Kenams.

Le cron effectue une action proactive par passage, en rotation sur huit créneaux. Dans GitHub Actions, **Run workflow** permet de choisir une action ou `all` pour une séquence limitée. Si Kenams n'a aucun Moment visible, la réaction est signalée comme non exercée.

Les appels, caméra/micro, médias photo/vidéo/audio, localisation réelle, paramètres de compte, suppression et modération ne sont pas simulés. Ce cron ne constitue pas un test complet de l'application.

## Rattrapage et limites

Le script lit les 100 derniers messages de chacune des 20 conversations de test les plus récentes et répond au dernier message de Kenams non suivi d'une réponse du bot, dans une fenêtre de 24 heures. Il ne rejoue pas tout l'historique. Les groupes avec un participant extérieur aux bots connectés et à Kenams sont ignorés.

L'identifiant de réponse est déterministe par bot et message source afin que les relances ne créent pas de doublon. Les délais réseau sont bornés, les refus serveur font échouer le passage et les sockets sont fermées même en cas d'erreur. Le workflow interdit les exécutions concurrentes. Les bots qui ne sont plus contacts de Kenams ne sont pas choisis pour les actions proactives.

## Vérifier localement

```sh
node --test scripts/bot-interactions.test.mjs
DAY_INTERACTIONS_ONCE=1 DAY_INTERACTIONS_ACTION=all node scripts/day-interactions.mjs
```

Le second appel produit de vraies interactions de test. Sans `DAY_INTERACTIONS_ONCE`, le script relève les messages toutes les 30 secondes (plus la durée d'un passage), renouvelle les connexions et limite les actions proactives à une par créneau de 30 minutes. `DAY_INTERACTIONS_HOURS` règle la durée, de plus de 0 à 24 heures (10 par défaut). `BOT_PASSWORD` peut remplacer le mot de passe des comptes de test existants.

Sur Windows avec un certificat d'entreprise, Node 22 récent peut nécessiter `--use-system-ca`. Ne pas désactiver la vérification TLS.
