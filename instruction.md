# World Drive — V1

## 1. Objectif

Construire une V1 d'un jeu de conduite open-world mondial basé sur les données réelles d'OpenStreetMap.

Le joueur doit pouvoir :

* apparaître dans une zone réelle du monde ;
* conduire une voiture librement ;
* voir les routes et bâtiments issus d'OpenStreetMap ;
* charger et décharger dynamiquement les zones autour de lui ;
* rencontrer des véhicules NPC ;
* voir d'autres joueurs en temps réel ;
* se déplacer sans écran de chargement entre les chunks ;
* utiliser une architecture conçue dès le départ pour pouvoir passer de quelques kilomètres carrés à un monde mondial.

La V1 doit privilégier :

1. performance ;
2. architecture scalable ;
3. streaming ;
4. gameplay ;
5. simplicité du code.

Ne pas chercher à reproduire graphiquement Google Maps, GTA ou un autre jeu AAA.

---

# 2. Stack obligatoire

Utiliser exclusivement TypeScript / JavaScript pour la logique applicative.

## Frontend / Game

* React
* Three.js
* TypeScript
* Vite
* TanStack Router si nécessaire
* Rapier.js pour la physique
* WebSocket pour le multiplayer

## Backend

* Node.js
* TypeScript
* WebSocket
* PostgreSQL
* Redis si nécessaire

## World data

* OpenStreetMap
* données OSM PBF pour le pipeline
* données d'élévation si nécessaire

## Assets

* GLTF / GLB
* KTX2 lorsque pertinent

Ne pas utiliser :

* Unity
* Unreal Engine
* Python pour le moteur de jeu
* serveur de jeu en Rust/C++
* Google Maps comme moteur du monde

---

# 3. Architecture

Créer un monorepo.

```text
world-drive/
│
├── apps/
│   ├── game/
│   │   ├── src/
│   │   │   ├── game/
│   │   │   ├── renderer/
│   │   │   ├── world/
│   │   │   ├── vehicles/
│   │   │   ├── networking/
│   │   │   ├── entities/
│   │   │   └── ui/
│   │   └── package.json
│   │
│   ├── server/
│   │   ├── src/
│   │   │   ├── world/
│   │   │   ├── players/
│   │   │   ├── vehicles/
│   │   │   ├── networking/
│   │   │   └── simulation/
│   │   └── package.json
│   │
│   └── web/
│       └── ...
│
├── packages/
│   ├── shared/
│   ├── world-data/
│   ├── protocol/
│   └── math/
│
├── scripts/
│   └── world-builder/
│
├── data/
│   └── development/
│
├── package.json
├── pnpm-workspace.yaml
└── instruction.md
```

Utiliser `pnpm`.

---

# 4. Principe fondamental du monde

Le monde ne doit jamais être chargé entièrement.

Le monde est divisé en chunks.

```text
        chunk
┌───────┬───────┬───────┐
│       │       │       │
├───────┼───────┼───────┤
│       │   🚗  │       │
├───────┼───────┼───────┤
│       │       │       │
└───────┴───────┴───────┘
```

Le joueur charge :

* son chunk ;
* les chunks adjacents ;
* éventuellement les chunks suivants dans la direction de déplacement.

Les chunks trop éloignés sont supprimés de la scène.

---

# 5. Système de coordonnées

Ne jamais utiliser directement latitude/longitude comme coordonnées Three.js.

Créer un système :

```ts
type WorldPosition = {
  x: number
  y: number
  z: number
}
```

et :

```ts
type GeoPosition = {
  latitude: number
  longitude: number
}
```

Créer des fonctions :

```ts
geoToWorld()
worldToGeo()
worldToChunk()
chunkToWorld()
```

Le système doit être déterministe.

La même position GPS doit toujours produire la même position monde.

Utiliser une projection géographique appropriée.

Pour la V1, choisir une origine locale autour de la zone de test afin d'éviter les problèmes de précision floating-point.

L'architecture doit cependant permettre de changer d'origine lorsque le joueur se déplace très loin.

---

# 6. Chunk system

Créer :

```ts
type ChunkId = {
  x: number
  z: number
  level: number
}
```

Chaque chunk doit pouvoir contenir :

```ts
type WorldChunk = {
  id: ChunkId
  roads: Road[]
  buildings: Building[]
  pointsOfInterest: PointOfInterest[]
}
```

Créer un `ChunkManager`.

Responsabilités :

```text
ChunkManager
│
├── calculateRequiredChunks()
├── loadChunk()
├── unloadChunk()
├── preloadChunk()
├── getChunk()
└── update()
```

Exemple :

```ts
chunkManager.update(playerPosition)
```

Le manager détermine automatiquement les chunks nécessaires.

---

# 7. OpenStreetMap

Ne jamais appeler une API OSM à chaque frame.

Ne jamais dépendre d'Overpass directement pendant le gameplay.

Le monde doit être préparé avant le lancement du jeu.

Créer un pipeline :

```text
OSM PBF
   ↓
Parser
   ↓
Filter
   ↓
Normalize
   ↓
Chunk generator
   ↓
Game data
```

Le pipeline doit extraire au minimum :

### Roads

* highway
* name
* lanes
* maxspeed
* bridge
* tunnel

### Buildings

* building
* building:levels
* height lorsqu'elle existe

### POI

Extraire uniquement quelques catégories utiles pour la V1.

---

# 8. Road graph

Les routes doivent être représentées sous forme de graphe.

```ts
type RoadNode = {
  id: string
  position: WorldPosition
}

type RoadEdge = {
  id: string
  from: string
  to: string
  length: number
  speedLimit?: number
  lanes?: number
}
```

Créer :

```ts
type RoadGraph = {
  nodes: Map<string, RoadNode>
  edges: Map<string, RoadEdge>
}
```

Ce graphe servira plus tard pour :

* NPC ;
* navigation ;
* missions ;
* GPS ;
* courses ;
* trafic.

---

# 9. Génération des routes

Transformer les chemins OSM en meshes Three.js.

Une route doit être générée à partir de ses points.

Créer un système :

```ts
RoadMeshGenerator
```

Il doit :

1. prendre une `Road` ;
2. calculer sa largeur ;
3. générer sa géométrie ;
4. générer les UV ;
5. appliquer le matériau ;
6. ajouter la route à la scène.

Les routes doivent être suffisamment optimisées pour permettre beaucoup de routes simultanément.

Éviter un mesh inutilement complexe.

---

# 10. Bâtiments

Créer un générateur de bâtiments :

```ts
BuildingMeshGenerator
```

Pour la V1, utiliser principalement des bâtiments low-poly.

Exemple :

```text
OSM polygon
     ↓
extrusion
     ↓
building mesh
```

Si `building:levels` existe :

```ts
height = levels * FLOOR_HEIGHT
```

Sinon utiliser une hauteur par défaut.

Ne pas essayer de générer des intérieurs.

---

# 11. Terrain

La V1 peut commencer avec un terrain plat si nécessaire.

Cependant l'architecture doit permettre d'ajouter ensuite :

```text
Elevation
 ↓
Heightmap
 ↓
Terrain chunks
```

Le terrain doit être indépendant du système de routes et de bâtiments.

---

# 12. Voiture

Créer une voiture contrôlable.

Le joueur doit pouvoir :

* accélérer ;
* freiner ;
* tourner ;
* reculer ;
* avoir une vitesse maximale ;
* avoir une friction ;
* entrer en collision.

Créer :

```ts
class PlayerCar
```

La physique doit être gérée par Rapier.

Ne pas construire un moteur physique maison complexe.

---

# 13. Camera

Créer une caméra troisième personne.

Comportement :

```text
             camera
                📷
                 \
                  \
                   🚗
```

La caméra doit :

* suivre la voiture ;
* avoir une interpolation fluide ;
* éviter les mouvements brusques ;
* permettre un léger contrôle orbital ;
* adapter sa distance à la vitesse.

---

# 14. NPC Traffic

Créer des véhicules NPC très simples.

Le trafic doit utiliser le `RoadGraph`.

Un NPC :

```text
spawn
 ↓
select road
 ↓
follow road
 ↓
intersection
 ↓
choose next road
 ↓
continue
```

La V1 ne nécessite pas :

* comportement réaliste ;
* feux complexes ;
* conduite agressive ;
* accidents complexes.

Objectif :

```text
🚗 → 🚗 → 🚗 → 🚗
```

Créer une simulation légère.

Les NPC éloignés doivent être simulés de manière simplifiée ou supprimés.

---

# 15. Multiplayer

Le serveur est authoritative.

Le client envoie principalement des inputs :

```ts
type PlayerInput = {
  throttle: number
  brake: number
  steering: number
  timestamp: number
}
```

Le serveur simule :

```text
input
 ↓
physics
 ↓
position
 ↓
rotation
 ↓
snapshot
```

Le serveur ne doit pas faire confiance à la position envoyée par le client.

---

# 16. Network protocol

Créer un package :

```text
packages/protocol
```

Définir des messages typés.

Exemple :

```ts
type ClientMessage =
  | {
      type: "player_input"
      input: PlayerInput
    }
  | {
      type: "ping"
      timestamp: number
    }
```

Et :

```ts
type ServerMessage =
  | {
      type: "world_snapshot"
      players: PlayerSnapshot[]
    }
  | {
      type: "chunk"
      chunk: SerializedChunk
    }
  | {
      type: "pong"
      timestamp: number
    }
```

Le protocole doit être partagé entre client et serveur.

Aucune duplication des types.

---

# 17. Interest Management

Ne jamais envoyer tous les joueurs à tous les clients.

Créer une zone d'intérêt autour du joueur.

Exemple :

```text
                2 km
        ┌───────────────────┐
        │                   │
        │    👤     🚗      │
        │                   │
        │       🚗          │
        │                   │
        │          👤       │
        └───────────────────┘
                  🚗
```

Seuls les joueurs suffisamment proches sont envoyés.

Créer une abstraction :

```ts
InterestManager
```

Elle devra pouvoir évoluer plus tard vers une gestion par chunks / spatial hash.

---

# 18. Interpolation réseau

Les joueurs distants ne doivent jamais être affichés avec des téléportations brutales.

Utiliser :

```text
server snapshots
       ↓
interpolation buffer
       ↓
smooth rendering
```

Le joueur local doit bénéficier d'une simulation prédictive si nécessaire.

Pour la V1 :

* local prediction simple ;
* server reconciliation basique ;
* interpolation pour les joueurs distants.

---

# 19. Rendering performance

La performance est une priorité.

Utiliser :

* frustum culling ;
* LOD ;
* instancing ;
* géométries partagées ;
* matériaux partagés ;
* texture atlases ;
* GLTF/GLB ;
* compression lorsque pertinent.

Éviter :

```ts
new Mesh()
```

pour chaque objet identique lorsque l'instancing est possible.

Créer des pools pour les véhicules NPC.

---

# 20. LOD

Implémenter au minimum :

```text
0 - 200m
HIGH

200 - 800m
MEDIUM

800m+
LOW / hidden
```

Les valeurs doivent être configurables.

Le système doit être générique :

```ts
LODManager
```

---

# 21. Streaming

Le chargement doit être asynchrone.

Ne jamais bloquer la boucle de rendu.

Mauvais :

```ts
while (...) {
  loadHugeChunk()
}
```

Correct :

```ts
await chunkLoader.load(chunk)
```

avec traitement progressif.

Les chunks doivent pouvoir être :

```text
requested
 ↓
loading
 ↓
loaded
 ↓
active
 ↓
unloading
 ↓
unloaded
```

Créer une machine d'état simple.

---

# 22. World cache

Le client doit mettre en cache temporairement les chunks déjà téléchargés.

Exemple :

```ts
Map<ChunkId, CachedChunk>
```

Le cache doit avoir une limite.

Ne jamais conserver toute la carte en mémoire.

---

# 23. Backend architecture

Le serveur V1 peut commencer avec un seul process.

Mais organiser le code pour permettre ensuite :

```text
Game Server 1
Game Server 2
Game Server 3
...
```

Chaque serveur devra pouvoir gérer une région du monde.

Créer :

```ts
WorldRegion
```

et :

```ts
GameServer
```

Ne pas coupler les joueurs à une ville spécifique.

---

# 24. World sharding futur

Le système doit être conçu autour des chunks.

Plus tard :

```text
chunk
 ↓
region
 ↓
game server
```

Exemple :

```text
Europe
├── Region A
├── Region B
└── Region C

America
├── Region D
└── Region E

Asia
├── Region F
└── Region G
```

La V1 n'a pas besoin de plusieurs serveurs.

L'architecture doit seulement éviter de rendre cette évolution impossible.

---

# 25. Base de données

PostgreSQL est destiné aux données persistantes.

Exemples :

```text
users
vehicles
player_profiles
inventory
missions
discoveries
```

Ne pas enregistrer la position du joueur à chaque frame dans PostgreSQL.

Les données temps réel restent en mémoire du game server.

---

# 26. Redis

Redis peut être ajouté pour :

* présence ;
* matchmaking ;
* communication inter-server ;
* sessions ;
* coordination.

Ne pas ajouter Redis inutilement dans la V1 si un seul serveur suffit.

Créer néanmoins une abstraction pour ne pas coupler toute l'application directement à Redis.

---

# 27. World data format

Les données de chunk doivent être sérialisables.

Exemple :

```ts
type SerializedChunk = {
  id: ChunkId
  roads: SerializedRoad[]
  buildings: SerializedBuilding[]
}
```

Le client doit pouvoir reconstruire le monde à partir de ces données.

Ne pas envoyer de données OSM brutes au client.

Envoyer des données déjà transformées pour le jeu.

---

# 28. Game loop

Créer une boucle de jeu propre.

```text
requestAnimationFrame
        ↓
input
        ↓
local simulation
        ↓
network
        ↓
physics
        ↓
world streaming
        ↓
NPC
        ↓
render
```

Le rendu doit rester indépendant du tick réseau.

---

# 29. Fixed timestep

La simulation physique doit utiliser un timestep stable.

Exemple conceptuel :

```ts
const FIXED_DT = 1 / 60
```

Le rendu peut tourner à :

```text
60 FPS
120 FPS
144 FPS
```

sans modifier la vitesse de simulation.

---

# 30. Debug tools

Créer un mode debug permettant d'afficher :

```text
FPS
memory
draw calls
triangles
current chunk
loaded chunks
player coordinates
GPS coordinates
network latency
players nearby
NPC count
```

Afficher également les limites des chunks :

```text
┌──────────────┐
│              │
│      🚗      │
│              │
└──────────────┘
```

Ajouter un toggle clavier.

---

# 31. V1 World

Pour tester le système, utiliser une petite zone réelle.

La zone de test doit être suffisamment grande pour tester :

* plusieurs chunks ;
* intersections ;
* routes différentes ;
* bâtiments ;
* changement de chunk ;
* trafic ;
* multiplayer.

Important :

**La zone de test est uniquement du contenu de développement.**

Le moteur ne doit jamais être codé spécifiquement pour cette zone.

---

# 32. V1 Definition of Done

La V1 est terminée lorsque :

### World

* [ ] OpenStreetMap est importé ;
* [ ] routes générées automatiquement ;
* [ ] bâtiments générés automatiquement ;
* [ ] coordonnées GPS converties en coordonnées monde ;
* [ ] chunks fonctionnels ;
* [ ] streaming fonctionnel ;
* [ ] unloading fonctionnel.

### Driving

* [ ] voiture contrôlable ;
* [ ] accélération ;
* [ ] frein ;
* [ ] direction ;
* [ ] collision ;
* [ ] caméra troisième personne.

### Traffic

* [ ] NPC ;
* [ ] navigation sur le road graph ;
* [ ] spawn/despawn ;
* [ ] simulation simplifiée à distance.

### Multiplayer

* [ ] WebSocket ;
* [ ] connexion joueur ;
* [ ] inputs ;
* [ ] simulation serveur ;
* [ ] snapshots ;
* [ ] interpolation ;
* [ ] plusieurs joueurs visibles ;
* [ ] interest management.

### Performance

* [ ] LOD ;
* [ ] instancing ;
* [ ] chunk streaming ;
* [ ] pas de chargement du monde complet ;
* [ ] debug FPS ;
* [ ] debug memory ;
* [ ] debug draw calls.

---

# 33. Ordre d'implémentation

Ne pas tout développer simultanément.

## Phase 1 — Engine

Créer :

```text
Three.js
Renderer
Game loop
Camera
Input
```

Objectif :

```text
🚗 dans une scène vide
```

---

## Phase 2 — Car

Ajouter :

```text
Rapier
Car controller
Camera follow
Collision
```

Objectif :

```text
🚗 conduire
```

---

## Phase 3 — OSM

Créer :

```text
OSM parser
Geo projection
Road generator
Building generator
```

Objectif :

```text
🚗 conduire dans une vraie zone
```

---

## Phase 4 — Chunks

Créer :

```text
ChunkManager
ChunkLoader
ChunkCache
LOD
```

Objectif :

```text
🚗 → chunk → chunk → chunk
```

sans rechargement de la page.

---

## Phase 5 — Traffic

Créer :

```text
RoadGraph
NPC
Pathfinding
Traffic simulation
```

Objectif :

```text
🚗 🚗 🚗 🚗
```

---

## Phase 6 — Multiplayer

Créer :

```text
WebSocket
GameServer
PlayerInput
Snapshots
Interpolation
Interest Management
```

Objectif :

```text
👤🚗
      👤🚗
```

---

## Phase 7 — Optimization

Mesurer avant d'optimiser.

Optimiser :

1. draw calls ;
2. triangles ;
3. mémoire ;
4. chunk loading ;
5. network bandwidth ;
6. NPC simulation ;
7. garbage collection.

---

# 34. Principes de développement

## Ne pas over-engineer

La V1 doit rester petite.

Ne pas créer immédiatement :

* microservices ;
* Kubernetes ;
* plusieurs régions serveur ;
* matchmaking complexe ;
* économie ;
* comptes complexes ;
* voitures réalistes ;
* météo ;
* système jour/nuit complexe.

---

## Mais ne pas créer de dette architecturale évidente

Le code doit être organisé autour de :

```text
World
Chunk
Entity
Player
Vehicle
Road
Server
Client
```

et non autour de la zone de test.

---

# 35. Objectif technique final

À la fin de la V1, l'expérience doit ressembler à :

```text
             🌍
              │
              ▼
      ┌─────────────────┐
      │  Open World     │
      │                 │
      │    🏢    🏢     │
      │                 │
      │ 🚗───────🚗──── │
      │       👤        │
      │                 │
      │   🏢       🏢   │
      └─────────────────┘
```

Le joueur doit pouvoir :

```text
spawn
  ↓
conduire
  ↓
traverser un chunk
  ↓
charger le suivant
  ↓
rencontrer des NPC
  ↓
rencontrer un autre joueur
  ↓
continuer à conduire
```

Le système doit être construit de manière à ce que, plus tard :

```text
V1
 ↓
ville
 ↓
région
 ↓
pays
 ↓
continent
 ↓
🌍 MONDE ENTIER
```

puisse être obtenu principalement en ajoutant des données et des serveurs, et non en réécrivant le moteur.

---

# 36. Priorité absolue

Si un choix doit être fait entre :

```text
graphismes
vs
architecture
```

choisir l'architecture.

Si un choix doit être fait entre :

```text
features
vs
performance
```

choisir la performance.

La V1 doit prouver une chose :

> **Il est possible de conduire librement dans un monde réel généré depuis OpenStreetMap, avec du streaming de terrain et plusieurs joueurs, en restant entièrement dans l'écosystème JavaScript/TypeScript.**
