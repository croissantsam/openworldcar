# MMO World Architecture Migration — TanStack Start Fullstack

## Objective

Migrate the existing worldwide open-world MMO to a **single-repository TanStack Start fullstack architecture**, without introducing a separate Node.js game server at this stage.

The target architecture must:

- Keep the existing TanStack Start application.
- Keep HTTP/API, server functions, realtime communication, and game logic in the same application/runtime.
- Support a **continuous worldwide world**.
- Avoid visible region boundaries, loading screens, map changes, reconnects, or WebSocket changes when players move between regions.
- Replace gameplay-time OpenStreetMap dependency with preprocessed/local world data.
- Fix the current problem where **teleportation breaks the spatial grid**.
- Keep the architecture ready for future extraction of workers/servers only when scale requires it.
- Avoid premature infrastructure complexity.

---

# 1. Target Architecture

```text
                         ┌───────────────────────┐
                         │       Browser         │
                         │  TanStack Start App   │
                         └───────────┬───────────┘
                                     │
                           HTTP / WebSocket
                                     │
                                     ▼
                    ┌──────────────────────────────┐
                    │      TanStack Start          │
                    │       Fullstack App          │
                    │                              │
                    │  ┌────────────────────────┐  │
                    │  │ HTTP / Server Functions│  │
                    │  └────────────────────────┘  │
                    │                              │
                    │  ┌────────────────────────┐  │
                    │  │ WebSocket / Realtime   │  │
                    │  └───────────┬────────────┘  │
                    │              │               │
                    │  ┌───────────▼────────────┐  │
                    │  │   Game Runtime         │  │
                    │  │                         │  │
                    │  │ - Player state          │  │
                    │  │ - Movement              │  │
                    │  │ - Vehicles              │  │
                    │  │ - Interest management   │  │
                    │  │ - Spatial grid          │  │
                    │  │ - Teleportation         │  │
                    │  └───────────┬─────────────┘  │
                    └──────────────┼────────────────┘
                                   │
                    ┌──────────────┼───────────────┐
                    │              │               │
                    ▼              ▼               ▼
              ┌─────────┐    ┌──────────┐    ┌──────────┐
              │ Redis   │    │Postgres/ │    │  World   │
              │         │    │ PostGIS  │    │  Data    │
              └─────────┘    └──────────┘    └──────────┘
                                                   │
                                             Preprocessed
                                                OSM data
```

There is intentionally **no separate game server in V1**.

The application server is the game server.

---

# 2. Repository Architecture

Keep one repository.

Recommended structure:

```text
/
├── src/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx
│   │   └── api/
│   │
│   ├── server/
│   │   ├── game/
│   │   │   ├── runtime.ts
│   │   │   ├── tick.ts
│   │   │   ├── players/
│   │   │   ├── vehicles/
│   │   │   ├── movement/
│   │   │   ├── teleport/
│   │   │   └── interest/
│   │   │
│   │   ├── world/
│   │   │   ├── coordinates.ts
│   │   │   ├── grid.ts
│   │   │   ├── chunks.ts
│   │   │   ├── loader.ts
│   │   │   └── world-data.ts
│   │   │
│   │   ├── realtime/
│   │   │   ├── websocket.ts
│   │   │   ├── sessions.ts
│   │   │   └── broadcast.ts
│   │   │
│   │   ├── persistence/
│   │   │   ├── postgres.ts
│   │   │   └── redis.ts
│   │   │
│   │   └── api/
│   │
│   ├── shared/
│   │   ├── types/
│   │   ├── protocol/
│   │   ├── constants/
│   │   └── math/
│   │
│   └── client/
│       ├── world/
│       ├── realtime/
│       ├── player/
│       └── rendering/
│
├── world-data/
│   ├── manifest.json
│   ├── chunks/
│   └── indexes/
│
├── scripts/
│   ├── import-osm.ts
│   ├── build-world.ts
│   └── validate-world.ts
│
└── package.json
```

The important separation is **logical**, not infrastructural.

Do not create a second server just to separate code.

---

# 3. Core Principle: World Coordinates Are Authoritative

The entire planet must use one global coordinate system.

Never use:

```text
server-local coordinates
region coordinates
teleport coordinates
OSM coordinates
```

as independent gameplay coordinate systems.

Use one canonical representation.

Recommended:

```ts
type WorldPosition = {
  x: number
  y: number
  z: number
}
```

or, when geographic precision is required:

```ts
type GeoPosition = {
  longitude: number
  latitude: number
  altitude: number
}
```

The game should internally operate primarily on a normalized world coordinate system.

Geographic coordinates should be an input/output representation.

---

# 4. Spatial Grid

The spatial grid is the central system for scaling the MMO.

Players must always belong to a grid cell.

```text
World
┌─────┬─────┬─────┬─────┐
│ 0,0 │ 1,0 │ 2,0 │ 3,0 │
├─────┼─────┼─────┼─────┤
│ 0,1 │ 1,1 │ 2,1 │ 3,1 │
├─────┼─────┼─────┼─────┤
│ 0,2 │ 1,2 │ 2,2 │ 3,2 │
├─────┼─────┼─────┼─────┤
│ 0,3 │ 1,3 │ 2,3 │ 3,3 │
└─────┴─────┴─────┴─────┘
```

A player has:

```ts
type GridPosition = {
  cellX: number
  cellY: number
}
```

The grid is derived from the canonical world position.

Never manually assign a player's grid after movement.

```ts
const cell = worldToGrid(position)
```

This makes teleportation and normal movement use exactly the same mechanism.

---

# 5. Teleportation Fix

## Current problem

Teleportation currently breaks the grid system.

This usually happens when teleportation directly modifies:

```text
player.position
```

without going through the same spatial registration mechanism used by normal movement.

This must be eliminated.

## Required architecture

Teleportation must be treated as a **world-position transition**, not as a special networking operation.

```text
Teleport request
      │
      ▼
Validate destination
      │
      ▼
Set canonical WorldPosition
      │
      ▼
Calculate new GridPosition
      │
      ▼
Remove player from old cell
      │
      ▼
Insert player into new cell
      │
      ▼
Recalculate interest set
      │
      ▼
Load required world chunks
      │
      ▼
Send authoritative state
```

Use one function:

```ts
movePlayer(playerId, destination)
```

and make both normal movement and teleportation eventually use the same world-state transition pipeline.

---

# 6. Atomic World Transition

Create a central operation:

```ts
transitionPlayer(
  playerId: PlayerId,
  destination: WorldPosition,
  reason: "movement" | "teleport" | "spawn" | "respawn"
)
```

The function must:

1. Validate the destination.
2. Calculate the destination grid cell.
3. Remove the player from the old cell if required.
4. Update the authoritative position.
5. Register the player in the new cell.
6. Recalculate nearby entities.
7. Update subscriptions/interests.
8. Ensure required world data is available.
9. Notify the client.
10. Persist the state when necessary.

No other system should directly mutate:

```ts
player.position
player.cell
player.region
```

---

# 7. Teleportation Must Not Create a New Connection

A teleport must never require:

```text
disconnect
connect
new WebSocket
new session
new server
```

The client keeps the same realtime connection.

Example:

```text
Before:

WebSocket
   │
   └── Player @ Paris

Teleport

WebSocket
   │
   └── Player @ Tokyo
```

The connection remains identical.

Only the player's authoritative world state changes.

---

# 8. Interest Management

The player should not receive the entire planet.

Only entities inside the player's interest area should be synchronized.

Example:

```text
       ┌───────────────┐
       │               │
       │  Visible area │
       │      ┌───┐    │
       │      │ P │    │
       │      └───┘    │
       │               │
       └───────────────┘
```

The server determines:

```ts
getInterestCells(playerPosition)
```

For example:

```text
current cell
+ adjacent cells
+ optionally next cells
```

This is essential for worldwide scaling.

---

# 9. Continuous Worldwide World

The player must never perceive the world as a collection of independent maps.

Avoid:

```text
Paris server
London server
Tokyo server
```

from the client's perspective.

Instead:

```text
                    WORLD
────────────────────────────────────────────

Europe → Asia → Pacific → America → Europe

          continuous coordinates
```

Regions and chunks are implementation details.

The player should experience one continuous world.

---

# 10. Chunk Streaming

The world should be divided into hierarchical chunks.

Example:

```text
Planet
  └── Region
       └── Sector
            └── Chunk
                 └── Cell
```

The exact hierarchy can evolve.

The important rule:

> Grid cells are for realtime simulation. Chunks are for world-data loading.

Do not mix these concepts.

---

# 11. Grid vs Chunk

### Grid

Used for:

- Players
- Vehicles
- NPCs
- Realtime entities
- Interest management
- Collision queries
- Proximity queries

### Chunk

Used for:

- Roads
- Buildings
- Terrain
- Water
- Elevation
- POIs
- World metadata

A chunk can contain many grid cells.

---

# 12. World Data and OpenStreetMap

OpenStreetMap must not be queried during normal gameplay.

Bad:

```text
Player moves
    ↓
Server requests OSM
    ↓
OSM
    ↓
Server
    ↓
Player
```

Target:

```text
OSM
 ↓
Offline preprocessing
 ↓
Game world format
 ↓
Local/object storage
 ↓
Runtime chunk loader
 ↓
Player
```

OSM becomes a **data source**, not a runtime dependency.

---

# 13. OSM Migration

Create an offline pipeline:

```text
OSM PBF
   │
   ▼
Parser
   │
   ▼
Normalization
   │
   ▼
World generation
   │
   ├── roads
   ├── buildings
   ├── water
   ├── terrain references
   ├── POIs
   └── metadata
   │
   ▼
Compressed chunks
```

The runtime should consume your own format.

For example:

```text
world-data/
  chunks/
    0000/
      0000.bin.zst
      0001.bin.zst
    0001/
      0000.bin.zst
```

The exact format can evolve.

The important architectural boundary is:

```text
OSM → build-time
Game world → runtime
```

---

# 14. OSM Independence Roadmap

### Phase 1

OSM is the primary source.

```text
OSM → preprocessing → world-data
```

### Phase 2

Add derived game data:

```text
OSM
 ↓
Game normalization
 ↓
Game world
```

### Phase 3

Add your own persistent world data:

```text
OSM ───────┐
           ├──► World Builder ───► Game World
Elevation ─┤
Terrain ───┤
Custom data┘
```

### Phase 4

OSM becomes optional.

The MMO can continue running using existing world data even when OSM is unavailable.

---

# 15. Redis

Redis should not become the source of truth for the entire world.

Use Redis for hot/shared state such as:

- Presence
- Sessions
- Distributed locks
- Temporary state
- Cross-process events
- Pub/Sub where needed
- Frequently changing shared data

Do not use Redis to store the entire planet by default.

The authoritative game state should remain inside the game runtime while the application is running, with persistent state stored appropriately.

---

# 16. PostgreSQL / PostGIS

Use PostgreSQL/PostGIS for persistent world and player data.

Good candidates:

```text
players
vehicles
inventories
accounts
world metadata
persistent objects
discoveries
locations
```

PostGIS can be used for:

- Geographic queries
- Persistent world objects
- Spatial indexes
- Administrative tooling
- World generation

Do not query PostgreSQL for every movement update.

Bad:

```text
10 updates/sec
× every player
× database query
```

Instead:

```text
Realtime state → memory
Persistent state → database
```

---

# 17. Realtime State

Realtime player state belongs in memory.

Example:

```ts
type RuntimePlayer = {
  id: string
  position: WorldPosition
  velocity: Vector3
  rotation: number
  cell: GridPosition
  connectionId: string
}
```

The runtime updates this state continuously.

Persistence should happen asynchronously or at controlled checkpoints.

---

# 18. Game Tick

Do not perform a global expensive operation for every player.

Use a tick loop with controlled work.

Example:

```ts
setInterval(() => {
  gameRuntime.tick()
}, TICK_RATE)
```

But the implementation should process only relevant active entities.

Conceptually:

```text
Tick
 │
 ├── active cells
 │     ├── players
 │     ├── vehicles
 │     └── NPCs
 │
 └── scheduled world tasks
```

Avoid:

```ts
for (const player of everyPlayer) {
  calculateEverythingForEveryone()
}
```

---

# 19. Player Movement

Normal movement:

```text
Client input
    ↓
Server validation
    ↓
Movement simulation
    ↓
New WorldPosition
    ↓
worldToGrid()
    ↓
Grid update if cell changed
    ↓
Interest update if required
    ↓
Broadcast relevant state
```

Teleportation uses the same final pipeline.

---

# 20. Teleportation

Teleportation:

```text
Teleport request
    ↓
Validate destination
    ↓
Resolve WorldPosition
    ↓
transitionPlayer()
    ↓
Grid recalculation
    ↓
Interest recalculation
    ↓
Chunk availability
    ↓
Authoritative snapshot
```

Never implement teleportation as:

```ts
player.position = destination
player.cell = destinationCell
```

in multiple unrelated places.

Centralize the transition.

---

# 21. Client Architecture

The client should maintain:

```text
Local player
      +
Visible entities
      +
Loaded world chunks
```

It should not attempt to maintain the entire planet.

Recommended client state:

```ts
type ClientWorldState = {
  player: PlayerState
  entities: Map<EntityId, EntityState>
  loadedChunks: Set<ChunkId>
}
```

---

# 22. Predictive Chunk Loading

The client should load world data before the player reaches it.

For a vehicle:

```text
          Movement direction
                  →
       ┌─────────────────────┐
       │ loaded │ preload    │
       │  now   │   next     │
       └─────────────────────┘
              Player
```

Use:

- Current chunk
- Neighboring chunks
- Movement direction
- Current speed

to predict what should be loaded next.

This prevents visible loading boundaries.

---

# 23. Teleport Preloading

For long-distance teleportation:

```text
Teleport request
      ↓
Server validates destination
      ↓
Destination chunk identified
      ↓
Destination world data prepared
      ↓
Authoritative transition
      ↓
Client receives destination snapshot
```

The client must not wait for OSM.

It receives game-world data from the application's world-data layer.

---

# 24. WebSocket Architecture

One persistent realtime connection per player.

Conceptually:

```text
Client
  │
  │ WebSocket
  ▼
TanStack Start runtime
  │
  ├── session
  ├── player state
  ├── interest management
  └── outbound events
```

Do not create one WebSocket per region.

Do not reconnect when crossing grid cells.

Do not reconnect when crossing chunks.

Do not reconnect after teleportation.

---

# 25. Server API vs Realtime

Use HTTP/server functions for:

- Authentication
- Account operations
- Inventory operations
- Configuration
- Non-realtime actions
- Administrative actions
- Initial world metadata

Use WebSocket/realtime for:

- Movement
- Position
- Vehicle state
- Nearby players
- Realtime events
- Combat/actions requiring realtime synchronization

---

# 26. Avoid Vite as the Runtime Concept

Vite is the development/build tool.

The architecture should be described as:

```text
TanStack Start application
```

not:

```text
Vite server
```

In development, Vite participates in the development server.

In production, TanStack Start runs through the chosen server/runtime adapter.

---

# 27. Migration Strategy

Do not rewrite the MMO.

Migrate incrementally.

## Step 1 — Introduce WorldPosition

Create:

```ts
WorldPosition
```

and make it the canonical position representation.

Do not change rendering yet.

---

## Step 2 — Introduce GridPosition

Create:

```ts
worldToGrid(position)
```

and derive grid membership from world position.

Remove duplicated/manual cell calculations.

---

## Step 3 — Centralize Player Transitions

Create:

```ts
transitionPlayer()
```

Route:

- spawn
- movement
- teleport
- respawn

through the same transition system.

This step fixes the teleport/grid problem.

---

## Step 4 — Separate Grid and Chunk Systems

Make explicit:

```text
Grid = realtime simulation
Chunk = world data
```

Do not use chunks as player-server boundaries.

---

## Step 5 — Add Interest Management

Only synchronize nearby entities.

```ts
getInterestCells(player)
```

must become the source for realtime visibility.

---

## Step 6 — Remove Runtime OSM Requests

Find every gameplay path that calls OSM.

Replace:

```text
runtime → OSM
```

with:

```text
runtime → world-data
```

OSM requests should only exist in:

```text
scripts/
world generation/
offline tooling/
```

---

## Step 7 — Add World Chunk Streaming

Implement:

```ts
loadChunk(chunkId)
unloadChunk(chunkId)
prefetchChunk(chunkId)
```

The game runtime should use the local/preprocessed world dataset.

---

## Step 8 — Add Persistence

Separate:

```text
Runtime state
```

from:

```text
Persistent state
```

Use PostgreSQL/PostGIS for durable state.

Use Redis only where shared/hot state is actually required.

---

## Step 9 — Optimize the Tick

Measure:

- tick duration
- players/tick
- entities/tick
- grid queries
- broadcasts
- serialization time
- database calls
- Redis calls
- world-data loads

Do not optimize based only on HTTP request latency.

---

# 28. Required Invariants

The migration is correct only if these invariants hold.

### Invariant 1

Every player has exactly one authoritative:

```text
WorldPosition
```

### Invariant 2

Grid membership is derived from WorldPosition.

### Invariant 3

Teleportation and movement use the same transition pipeline.

### Invariant 4

Teleportation does not create a new WebSocket connection.

### Invariant 5

Crossing a grid cell does not create a new session.

### Invariant 6

Crossing a chunk does not create a new session.

### Invariant 7

OSM is never required for normal gameplay.

### Invariant 8

The client never needs the entire planet loaded.

### Invariant 9

The realtime runtime does not query PostgreSQL for every movement update.

### Invariant 10

Grid cells are not treated as separate servers.

---

# 29. Testing

Create automated tests for:

## Movement

```text
cell A → cell B
```

Expected:

```text
remove A
insert B
```

## Teleportation

```text
Paris → Tokyo
```

Expected:

```text
same player ID
same session
same WebSocket
new WorldPosition
new GridPosition
new interest set
```

## Long-distance movement

```text
France → Germany → Poland → Asia
```

Expected:

```text
no reconnect
no region handoff
no session reset
```

## Chunk transition

```text
chunk A → chunk B
```

Expected:

```text
world data changes
player session unchanged
```

## OSM outage

Disable OSM access.

Expected:

```text
existing gameplay continues
```

---

# 30. Observability

Track:

```text
active_players
active_cells
active_entities
tick_duration_ms
tick_overruns
websocket_connections
messages_in_per_second
messages_out_per_second
serialization_ms
grid_query_ms
world_chunk_load_ms
redis_latency_ms
postgres_latency_ms
```

Most importantly:

```text
p95 tick duration
p99 tick duration
```

The game server must maintain its tick budget.

---

# 31. Future Scaling

Do not introduce multiple game servers now.

When a single TanStack Start runtime becomes insufficient, extract the game runtime behind a stable interface.

Current:

```text
TanStack Start
 ├── API
 ├── WebSocket
 └── Game Runtime
```

Future:

```text
TanStack Start
 ├── API
 └── Realtime Gateway
          │
          ▼
      Game Workers
       ├── Worker A
       ├── Worker B
       └── Worker C
```

The important part is that the game code should already be separated logically.

The future extraction should be:

```text
move runtime
```

not:

```text
rewrite runtime
```

---

# 32. Future Worker Model

When scaling becomes necessary, workers can process groups of active cells.

Example:

```text
             Realtime Gateway
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
   Worker A      Worker B      Worker C
   cells 0-99    cells 100-199 cells 200-299
```

However, these are **implementation partitions**, not visible world regions.

A player can move between workers without changing:

- identity
- WebSocket
- world coordinates
- session
- client experience

---

# 33. Critical Design Rule

Never let infrastructure boundaries become gameplay boundaries.

Bad:

```text
Region = server
Region = WebSocket
Region = session
Region = map
```

Correct:

```text
Region/chunk = data organization

Grid = realtime spatial organization

Server/runtime = execution environment

World = one continuous space
```

---

# 34. Final Target

The desired V1 architecture is:

```text
                       WORLD
                         │
                 Global coordinates
                         │
              ┌──────────┴──────────┐
              │                     │
         World Chunks          Spatial Grid
              │                     │
       static world data       realtime state
              │                     │
              └──────────┬──────────┘
                         │
                  TanStack Start
                         │
             ┌───────────┴───────────┐
             │                       │
          HTTP/API              WebSocket
             │                       │
             └───────────┬───────────┘
                         │
                  Game Runtime
                         │
                ┌────────┴────────┐
                │                 │
             Redis            PostgreSQL
```

### Architecture principles

1. **One repository**
2. **One TanStack Start fullstack application**
3. **One continuous planetary world**
4. **One persistent realtime connection per player**
5. **One canonical WorldPosition**
6. **Grid derived from WorldPosition**
7. **Teleportation uses the same transition pipeline as movement**
8. **Grid and world chunks are separate concepts**
9. **OSM is an offline data source, not a gameplay dependency**
10. **Realtime state stays in memory**
11. **Persistence is asynchronous / controlled**
12. **Interest management limits realtime traffic**
13. **Infrastructure boundaries remain invisible to players**
14. **Game runtime is logically isolated so it can be extracted later**
15. **Do not introduce distributed infrastructure until measurements require it**

---

# 35. Migration Definition of Done

The migration is complete when:

- [ ] MMO still runs from the existing TanStack Start repository.
- [ ] No separate game server is required.
- [ ] Player positions use a canonical world coordinate system.
- [ ] Spatial grid membership is deterministic.
- [ ] Movement updates the grid correctly.
- [ ] Teleportation updates the grid correctly.
- [ ] Teleportation does not reconnect the player.
- [ ] Grid transitions do not reconnect the player.
- [ ] Chunk transitions do not reconnect the player.
- [ ] Interest management limits nearby-player synchronization.
- [ ] OSM is not called during normal gameplay.
- [ ] World data can be served from preprocessed chunks.
- [ ] PostgreSQL is not queried for every movement update.
- [ ] Redis is not used as an unnecessary global world database.
- [ ] World streaming works transparently.
- [ ] Long-distance teleportation works transparently.
- [ ] The entire planet remains one logical world.
- [ ] The game runtime can later be extracted without rewriting gameplay logic.

---

# 36. Recommended Implementation Order

```text
1. WorldPosition
        ↓
2. worldToGrid()
        ↓
3. transitionPlayer()
        ↓
4. Fix teleportation
        ↓
5. Spatial grid
        ↓
6. Interest management
        ↓
7. Chunk abstraction
        ↓
8. Preprocessed OSM world data
        ↓
9. Chunk streaming
        ↓
10. Runtime performance profiling
        ↓
11. Redis optimization where needed
        ↓
12. PostgreSQL persistence optimization
        ↓
13. Only then consider extracting workers
```

The priority is **correctness and clean boundaries first, horizontal scaling second**.
