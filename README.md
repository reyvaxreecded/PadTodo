# PadTodo

Gestion de tâches collaborative pour une équipe sur son réseau local. Un espace commun, plusieurs projets, des sections et des tâches. Aucune inscription, aucun compte, aucun Docker et aucun service cloud.

## Prérequis

- Node.js **24 LTS, version 24.15 ou supérieure** (24.x), npm 11.
- PostgreSQL **16 à 18**, installé manuellement et démarré ; les validations de ce projet utilisent PostgreSQL 18.
- Pour les tests navigateur : Google Chrome installé, ou Chromium Playwright (instructions ci-dessous).

Angular **22.2.4**, CLI/SSR/CDK **22.2.5**, TypeScript **6.0**, Express **5**, Prisma **7.10.1** et l’adaptateur PostgreSQL. Les versions exactes sont verrouillées par `package-lock.json`. Prisma 8 n’a pas été retenu car la version proposée par le registre lors de l’installation était une préversion.

## Installation

```sh
npm ci
cp .env.example .env
```

Créez un rôle et une base avec les outils PostgreSQL (les commandes doivent être exécutées par un administrateur PostgreSQL) :

```sh
createuser -h localhost -U postgres --pwprompt padtodo
createdb -h localhost -U postgres --owner=padtodo padtodo
```

`--pwprompt` demande le mot de passe du **nouveau rôle**. Si votre installation utilise un autre administrateur local, remplacez `postgres` par ce nom. Sur macOS, les outils d’une installation EnterpriseDB se trouvent généralement dans `/Library/PostgreSQL/18/bin` ; ajoutez ce dossier à votre `PATH` si nécessaire.

Éditez `.env` :

```dotenv
HOST=0.0.0.0
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://padtodo:VOTRE_MOT_DE_PASSE@localhost:5432/padtodo?schema=public
ALLOWED_HOSTS=
```

Encodez les caractères réservés du mot de passe dans l’URL (`@` devient `%40`, par exemple). Le fichier `.env` est ignoré par Git. Seul le serveur reçoit l’URL PostgreSQL.

```sh
npm run db:migrate
npm run db:seed  # facultatif : ajoute les projets de démonstration si la base est vide
npm run dev
```

Ouvrez [http://localhost:4000](http://localhost:4000). `dev` charge `.env`, génère le client Prisma et lance le serveur de développement Angular avec le SSR et l’API sur le même port. `HOST` et `PORT` sont aussi respectés en développement. Pour un usage partagé quotidien, utilisez la version compilée.

## Version compilée et accès LAN

```sh
npm run build
npm start
```

Définissez `NODE_ENV=production` dans `.env`. `npm start` exécute `dist/pad-todo/server/server.mjs` et charge `.env` s’il existe. Arrêt propre par `Ctrl+C`, `SIGINT` ou `SIGTERM`.

Avec `HOST=0.0.0.0`, les collègues ouvrent `http://ADRESSE_IP_DU_SERVEUR:4000`. Trouvez l’IP dans les paramètres réseau du serveur (`ipconfig getifaddr en0` sur macOS pour l’interface Wi-Fi habituelle, `ip addr` sur Linux, `ipconfig` sur Windows). Aucun numéro d’IP n’est codé en dur. Les adresses des interfaces réseau, `localhost` et le nom de la machine sont autorisés automatiquement pour le SSR. Redémarrez le processus après un changement d’IP. Pour un alias DNS supplémentaire, renseignez `ALLOWED_HOSTS=mon-serveur.lan,autre-nom.lan` sans protocole ni port.

Autorisez le port HTTP choisi dans le pare-feu **uniquement pour les postes ou le sous-réseau LAN autorisés**. PostgreSQL reste sur le serveur, lié à la boucle locale : ne rendez pas son port accessible aux postes clients. Sans authentification, toute personne pouvant accéder au serveur HTTP peut lire, modifier et supprimer toutes les données. Cette application n’est pas destinée à une exposition Internet. Aucun script distant ni police distante n’est requis.

Si un reverse proxy est ajouté, il doit préserver le `Host`, autoriser les connexions SSE longues et désactiver leur buffering. L’application ne fait pas confiance aux en-têtes proxy transmis par des clients arbitraires.

## Utilisation

- Créez une liste avec **+** dans la navigation ; réorganisez les listes avec la poignée au survol. Le compteur indique les tâches ouvertes.
- Les paramètres de la liste permettent de changer son nom, sa description, sa couleur et de la supprimer. La confirmation précise la suppression de toutes les sections et tâches.
- Créez des sections et repliez-les avec leur chevron. Cliquez directement sur leur titre pour le modifier : la sauvegarde est automatique après 650 ms de pause. `Entrée` enregistre et place le curseur dans la nouvelle ligne sous le titre ; `Échap` annule la saisie non enregistrée. **… → Renommer** ouvre aussi cette édition. Les sections peuvent être déplacées à la souris ou avec **Monter / Descendre**.
- Écrivez directement au bas d’une section, ou cliquez sur **Nouvelle note**. Une première section « Notes de réunion » est créée automatiquement si nécessaire. Les nouvelles lignes et les modifications s’enregistrent sans bouton de validation ; Entrée enchaîne les lignes immédiatement, même pendant un enregistrement.
- Cliquez sur un titre pour l’éditer sur place, à l’endroit du clic. **Maj+Entrée** ouvre le corps de la note juste en dessous ; les paragraphes et les collages multilignes y sont conservés. **…** ouvre toujours le détail pour les propriétés supplémentaires, la duplication et la suppression avec confirmation. La catégorie et la priorité restent modifiables dans la ligne.
- Gérez les catégories depuis **Catégories**. Leur suppression conserve les tâches et enlève leur association.
- Glissez les tâches par leur poignée dans une section ou entre les sections de la même liste. Chaque déplacement est enregistré en base. Il n’y a pas de mutation optimiste : le serveur reste la référence, y compris en cas d’erreur.
- La recherche porte sur le titre et la description. Les filtres autorisent plusieurs valeurs : **OR dans un groupe, AND entre groupes**. La vue est conservée dans l’URL, et peut être partagée. Les filtres ne modifient jamais les données. Le drag & drop et les mouvements de sections sont désactivés pendant le filtrage.
- Le thème, la réduction de la sidebar et les sections repliées sont propres au navigateur et conservés en stockage local. Les données métier restent dans PostgreSQL.

## Écrire en réunion

| Touche                                          | Action                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `Entrée` dans un titre ou une nouvelle ligne    | Continuer sur une ligne après la ligne courante (avant si le curseur est au début du titre)             |
| `Maj+Entrée` dans un titre                      | Écrire le contexte directement sous le titre                                                            |
| `Entrée` dans le contexte                       | Ajouter un paragraphe à cette note                                                                      |
| `↑` au début / `↓` à la fin d’un titre          | Passer à la ligne précédente / suivante                                                                 |
| `Retour arrière` sur une ligne entièrement vide | Supprimer la ligne et revenir à la précédente                                                           |
| `⌘/Ctrl + Maj + Retour arrière`                 | Supprimer la ligne sans modal, avec possibilité d’annuler                                               |
| `⌘/Ctrl + Entrée`                               | Terminer ou rouvrir la tâche                                                                            |
| `⌘/Ctrl + S`                                    | Enregistrer immédiatement la ligne en cours                                                             |
| `Échap`                                         | Revenir au titre depuis le contexte, ou quitter l’édition depuis le titre                               |
| `⌘/Ctrl + Z` juste après suppression            | Annuler cette suppression ; après reprise de la frappe, le raccourci reste l’annulation native du texte |

Une ligne dont le titre et le contexte sont entièrement vides (ou composés d’espaces) est supprimée automatiquement à la sauvegarde ou en quittant le champ, sans erreur de validation. La suppression reste annulable. Si le contexte contient encore du texte, la note est conservée et sa première ligne remplace le titre vide.

Les raccourcis sont rappelés dans **Raccourcis clavier**, au-dessus des sections. L’insertion est transactionnelle et conserve l’ordre des tâches. Une suppression rapide dispose d’un bouton **Annuler** pendant **90 secondes** ; son reçu de restauration est conservé dans le processus Node. Un redémarrage du serveur ou la suppression de la section empêche cette annulation. Les suppressions confirmées depuis les autres menus restent définitives.

Les modifications se sauvegardent après 650 ms d’inactivité, au changement de champ ou sur demande ; une nouvelle note est enregistrée après 850 ms, Entrée ou la sortie du champ. La saisie reste disponible pendant les requêtes. Un identifiant de création stable évite un doublon si le serveur a enregistré une note mais que sa réponse a été perdue. La génération de cet identifiant fonctionne aussi sur une adresse HTTP du LAN.

Les brouillons non enregistrés disposent d’une copie de récupération locale lorsque le stockage du navigateur est disponible. Ils sont repris à la reconnexion ou à la réouverture de la ligne ; les données partagées restent dans PostgreSQL. Deux éditions du même texte déclenchent un choix explicite : **Conserver mon texte** ou **Utiliser la version partagée**. Une modification de priorité ou d’ordre sans changement du texte est reprise sans interrompre la rédaction. Le texte est en format brut ; la première ligne sert de titre, la suite de contexte.

## Titres et sections à la volée

Dans une nouvelle ligne ou le titre d’une note, écrivez un à six `#`, un espace et le titre, puis appuyez sur **Entrée** :

```text
# Décisions
## Prochaines étapes
### Points techniques
###### Détails
```

La ligne devient une section partagée, avec un niveau de titre de 1 à 6, une taille distincte et un niveau accessible correspondant. Le curseur continue dans la nouvelle section. Les sections s’imbriquent automatiquement : chaque titre appartient au titre précédent le plus proche de niveau inférieur. Un nouveau titre de même niveau ferme la sous-section précédente. Les niveaux manquants sont autorisés (un niveau 3 peut suivre directement un niveau 1). Replier un parent masque toute sa branche ; le déplacer emporte ses sous-sections. Modifier un niveau réorganise immédiatement cette hiérarchie.

Si le titre est créé au milieu d’une section, les lignes suivantes passent sous le nouveau titre dans une transaction PostgreSQL. Transformer une note existante conserve son contexte : il devient une note sous le titre. Le même préfixe peut changer le niveau d’une section lors de son renommage. Un simple `# ` attend son intitulé ; `#bug42` sans espace et les `#` au milieu d’un texte restent du texte normal. Les niveaux sont conservés après rechargement et diffusés aux autres navigateurs.

La migration `202611040002_heading_levels` ajoute `TaskSection.level` avec une contrainte de 1 à 6 ; les sections antérieures sont de niveau 2. L’endpoint `POST /api/sections/:id/headings` valide la liste, le point de découpage et la version de la note source avant la création et le déplacement des lignes.

## Architecture

```text
src/app/
  core/         HTTP, préférences locales, flux temps réel
  lists/        orchestration de l’espace, navigation, formulaires et vue projet
  sections/     calcul de réorganisation sans mutation du snapshot
  tasks/        édition directe, brouillons, saisie enchaînée et panneau de détail
  categories/   composant de gestion des catégories
  shared/       types, filtres purs, icônes SVG locales
src/server/
  routes/       endpoints REST Express
  controllers/  adaptation des requêtes et enveloppes de réponse
  services/     règles métier, transactions et contrôle des versions
  data/         client Prisma et pool PostgreSQL
  validation.ts schémas Zod stricts
  errors.ts     erreurs centralisées sans trace SQL côté client
  events.ts     abonnements SSE et diffusion après commit
prisma/
  schema.prisma
  migrations/   migration SQL initiale, contraintes et triggers d’intégrité
  seed.ts       démonstration facultative, jamais exécutée au démarrage
```

Un seul processus Node sert les fichiers, l’API et Angular SSR. Les composants sont standalone, utilisent Signals, Router, Reactive Forms et la syntaxe `@if` / `@for`. Les styles sont en SCSS, avec des icônes SVG locales. La taille des requêtes JSON est limitée à 128 ko. Les UUID, enums, longueurs, couleurs et champs inconnus sont validés ; les écritures cross-origin du navigateur sont refusées.

Le SSR utilise le contexte `REQUEST` pour construire l’origine de l’API, et l’origine du document dans le navigateur. Les URL identiques permettent au cache de transfert HTTP officiel de réutiliser les réponses pendant l’hydratation. Les routes sont rendues à l’exécution (`RenderMode.Server`), sans pré-rendu lié à une base disponible au build. `EventSource` et les préférences navigateur sont initialisés après le rendu côté client seulement.

### Fiabilité et concurrence

Toutes les écritures métier passent par une transaction et un verrou consultatif PostgreSQL commun à l’espace. Ce choix simple sérialise les écritures d’une petite équipe, préserve les positions et évite les courses entre création, déplacement et suppression. Les snapshots multi-tables sont lus en isolation `RepeatableRead`. Les positions ne portent aucune unicité qui bloquerait une réorganisation.

Les éditions envoient `expectedUpdatedAt`. Si une autre personne a modifié l’enregistrement, l’API répond **409** ; le panneau de tâche garde les saisies et signale la nouvelle version. Fermez et rouvrez le panneau pour récupérer les données actuelles. Les déplacements restent atomiques et recalculent les positions sous verrou. Les catégories et sections d’une tâche appartiennent obligatoirement à la même liste ; des triggers PostgreSQL renforcent cette règle et interdisent le changement de liste parente d’une section ou catégorie. Une contrainte vérifie la cohérence de `completedAt` avec le statut.

### SSE

`GET /api/events` retourne `text/event-stream`. Chaque mutation validée diffuse `event: change`, un identifiant `époque:compteur`, un type (`task.updated`, `section.created`, etc.), `resourceId` et `listId`. Heartbeat toutes les 15 secondes, `retry: 2000`, nettoyage à la déconnexion et fermeture à l’arrêt du serveur. Un client trop lent est déconnecté et se resynchronise.

Les clients regroupent les notifications sur 120 ms, rechargent les snapshots et refusent les réponses dépassées lors d’un changement de liste. Le navigateur reconnecte automatiquement `EventSource`. L’événement `ready` impose une resynchronisation complète à chaque connexion, y compris après redémarrage serveur : aucun journal de rejeu n’est nécessaire. Le bus est en mémoire, prévu pour **un seul processus Node**, sans cluster ni Redis.

## API

Les lectures et mutations JSON répondent `{ "data": ... }`. Les suppressions répondent **204** sans corps. Les erreurs utilisent `{ "error": { "message": "...", "details": [...] } }`, avec `details` pour les validations.

| Domaine    | Routes                                                                                                                                                                |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listes     | `GET/POST /api/lists`, `GET/PATCH/DELETE /api/lists/:id`, `PATCH /api/lists/reorder`                                                                                  |
| Sections   | `GET/POST /api/lists/:listId/sections`, `PATCH/DELETE /api/sections/:id`, `PATCH /api/sections/reorder`                                                               |
| Tâches     | `GET /api/lists/:listId/tasks`, `POST /api/sections/:sectionId/tasks`, `GET/PATCH/DELETE /api/tasks/:id`, `POST /api/tasks/:id/duplicate`, `PATCH /api/tasks/reorder` |
| Catégories | `GET/POST /api/lists/:listId/categories`, `PATCH/DELETE /api/categories/:id`                                                                                          |
| Technique  | `GET /api/events`, `GET /api/health`                                                                                                                                  |

`GET /api/lists/:id` inclut les sections, tâches et catégories ordonnées. Les endpoints de réorganisation des listes/sections attendent `{ids: [...]}` contenant l’ensemble des IDs du périmètre ; les sections requièrent aussi `listId`. Un périmètre devenu obsolète renvoie 409. Le déplacement d’une tâche attend `{taskId, sectionId, position}`. La création accepte `afterTaskId` ou `beforeTaskId` pour insérer une note, et un `clientId` UUID optionnel pour rendre une reprise idempotente. `POST /api/tasks/:id/trash` supprime avec reçu annulable ; `POST /api/tasks/restore` attend `{token}` pour restaurer la ligne sous transaction. Le statut de santé renvoie 503 si PostgreSQL est indisponible.

## Tests et vérifications

```sh
npm run typecheck
npm test
npm run build
npm start
# Dans un autre terminal, avec Google Chrome installé :
npm run test:e2e
npm run format:check
```

`npm test` utilise **une vraie base PostgreSQL** configurée par `DATABASE_URL` et un serveur HTTP de test sur un port éphémère. Il crée ses propres listes et les nettoie. Utilisez de préférence une base dédiée :

```sh
createdb -h localhost -U postgres --owner=padtodo padtodo_test
DATABASE_URL='postgresql://padtodo:VOTRE_MOT_DE_PASSE@localhost:5432/padtodo_test?schema=public' npm run db:migrate
DATABASE_URL='postgresql://padtodo:VOTRE_MOT_DE_PASSE@localhost:5432/padtodo_test?schema=public' npm test
```

Le serveur démarré pour les tests E2E doit utiliser cette même base ; son URL se configure avec `E2E_BASE_URL`. Les tests navigateur créent leurs listes sur ce serveur puis les suppriment. Le premier test vérifie la persistance après rechargement et la collaboration avec deux contextes de navigateur indépendants. Les suivants couvrent catégories, édition directe, drag & drop des tâches et sections, repli local, mobile et HTML SSR. Les traces des échecs sont dans `test-results/`.

Sans Chrome : `npx playwright install chromium`, puis remplacez `channel: 'chrome'` par `channel: 'chromium'` dans `playwright.config.ts`. Aucun navigateur n’est installé automatiquement par l’application.

Les tests API couvrent CRUD, valeurs par défaut, transitions de statut et `completedAt`, priorités, duplication, suppression de catégorie, cascades, garde d’intégrité en SQL, réorganisation et persistance des positions, éditions concurrentes, ajouts et déplacements simultanés, validation, cross-origin, flux SSE multi-clients, reconnexion et heartbeat. Les filtres sont testés séparément comme fonctions pures. L’absence de PostgreSQL doit faire échouer explicitement les tests d’intégration, sans faux succès ni données de remplacement.

## Sauvegarde et limites

Sauvegardez régulièrement la base avec `pg_dump` et testez sa restauration. Les suppressions confirmées sont définitives ; aucun historique ni corbeille durable n’est implémenté. Seules les suppressions rapides peuvent être annulées pendant 90 secondes. Le traitement séquentiel des écritures vise une petite équipe, pas une forte charge distribuée. L’application n’a ni comptes, commentaires, pièces jointes, calendrier, ni notifications par email.

Le fonctionnement depuis un autre poste dépend des règles du réseau et du pare-feu. Les tests automatisés utilisent deux navigateurs distincts sur la machine du serveur ; ils ne valident pas la configuration réseau d’un autre ordinateur.

## Validation réalisée le 4 novembre 2026

- Migration initiale appliquée sur PostgreSQL 18 et données de démonstration insérées.
- `npm run typecheck`, `npm run format:check` et `npm run build` : réussis.
- `npm test` sur une base isolée : **9 tests réussis**, aucun ignoré.
- `npm run test:e2e` sur le serveur compilé relié à cette base : **3 parcours réussis**, dont deux navigateurs, reconnexion SSE, drag & drop et écran mobile à 390 px.
- Mode développement vérifié : API et SSR sur le même port.
- Version compilée vérifiée sur `localhost` et sur l’adresse LAN du serveur depuis cette machine. Accès depuis un second poste à confirmer avec le pare-feu du LAN.

## Validation de la prise de notes au clavier

- **12 tests API / texte réussis** sur PostgreSQL isolé : insertion ancrée, restauration après suppression, disparition d’une catégorie et création idempotente incluses.
- **9 parcours E2E réussis** : édition directe, prise de notes multilignes, saisie pendant les requêtes, espaces et curseur préservés, suppression / annulation au clavier, erreur réseau, reprise de brouillon, conflit concurrent et réponse de création perdue.
- Version compilée vérifiée via l’adresse HTTP LAN : **3 parcours supplémentaires réussis** (SSR, frappe rapide, première sauvegarde d’une note).
- Contrôle TypeScript, formatage et build : réussis, sans dépassement des budgets du build.

## Validation des titres Markdown

Migration des niveaux appliquée ; **14 tests API / texte** et **13 parcours E2E** réussis. Les vérifications couvrent les niveaux 1 à 6, l’absence de faux positifs pour les hashtags, le renommage d’un titre, la conversion d’une note avec conservation de son contexte, le découpage des sections et la persistance après rechargement. TypeScript, formatage et build réussis.


## Édition directe des titres de section

Les titres se modifient sur place au clic, avec sauvegarde automatique et changement de niveau par préfixe Markdown. Entrée poursuit la prise de notes, Échap annule les caractères non enregistrés. Les brouillons restent éditables pendant les requêtes et les conflits proposent un choix explicite. Validation : **15 parcours E2E réussis**, dont deux nouveaux tests consacrés à cette édition ; TypeScript, formatage et build réussis.


## Sections imbriquées

La hiérarchie est déduite des niveaux et de l’ordre partagés des titres, sans migration supplémentaire. Les sous-sections se replient avec leur parent ; les déplacements de sections déplacent leur branche. Les filtres conservent les parents des résultats, et les changements de niveau gardent le curseur pendant l’édition. Vérification : **17 parcours E2E réussis**, build et formatage validés, contrôle visuel sur mobile jusqu’à six niveaux.
