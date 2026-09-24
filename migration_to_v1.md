# MMO World Architecture Migration — TanStack Start Fullstack

> **Implementation status (2026-09-23, audited against `apps/game/src` + `packages/*`):**
> This document is the target spec. Status tags below reflect what is actually
> implemented today. See **Appendix A** at the bottom for the file-by-file mapping.
> Legend: ✅ done · ⚠️ partial / diverged · ❌ todo · ➖ intentionally not applicable.
> See **Appendix A** at the bottom for the file-by-file mapping.

| Area | Status | Actual |
|---|---|---|
| Single TanStack Start fullstack, colocated WS `/api/mp`, no separate server | ✅ | `apps/game/src/multiplayer/mp-ws-handler.ts`, `get-server.ts`, `GameServer.ts` |
| Canonical `WorldPosition` / `GeoPosition`, deterministic geo math | ✅ | `packages/math/src/geo.ts`, `chunk.ts` |
| Chunk streaming + cache + LOD + predictive load | ✅ | `src/world/ChunkManager.ts`, `ChunkLoader.ts`, `ChunkCache.ts`, `ChunkState.ts`, `OsmStreamingManager.ts`, `src/lod/LODManager.ts`, `src/settings/SettingsStore.ts` |
| Offline OSM pipeline (`world-builder` → game chunks) | ➖ | Removed by design: one uniform live-streaming pipeline everywhere, no per-place packs |
| Runtime OSM independence (no OSM during gameplay) | ❌ | By decision: live OSM is the single source; server disk cache (`.cache/osm`) is the uniform buffer |
| Spatial grid (`GridPosition`, `worldToGrid`, `transitionPlayer`) | ❌ | Does not exist in code (only in this doc). Replaced by 500 m chunks + `resetToOrigin()` + 2 km interest radius |
| Teleport without reconnect (same WS/session) | ✅ | `GameEngine.travelTo()`, `PlayerCar.teleport()`, `GameClient.sendRespawn()` — same WS kept |
| Central `transitionPlayer(movement/teleport/spawn/respawn)` | ❌ | Teleport path is `travelTo → resetToOrigin → osmStreaming.reset → teleport → sendRespawn → _fetchInitialOsm` |
| Continuous planetary coordinates | ⚠️ | Continuous **within** a destination; long-distance travel re-centers origin via `setWorldOrigin()` per `src/world/destinations.ts` |
| Interest management (2 km) | ✅ | `src/multiplayer/interest/InterestManager.ts` (haversine on `geo`, 20 Hz filtered `world_snapshot`) |
| Realtime state in memory, async persistence, no DB per tick | ✅ | `GameServer.sessions` in memory; SQLite/libsql + drizzle (`src/lib/db/schema.ts`), autosave 2 s/20 s via `src/services/profileSync.ts` |
| Redis / Postgres as specified | ⚠️ | Neither used: no `redis` dep; SQLite/libsql replaces Postgres (`src/lib/db.ts`, `better-auth` + `drizzleAdapter(sqlite)`) |
| Tick budgets + observability (p95/p99, metrics) | ⚠️ | Server 20 Hz (`GameServer.ts:17`), client physics 1/60 (`GameEngine.ts:67`); only `DebugOverlay` (FPS/draw/tris/chunks/GPS/latency) — no metrics pipeline |
| Automated migration tests | ✅ | `pnpm test` (vitest, 77 tests) |

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

> **Ratified 2026-09-23 — decision: chunk + geo-haversine model adopted, grid NOT built.**
> `GridPosition` / `worldToGrid()` were never implemented (zero hits in code) and are
> superseded: locality = 500 m chunks (`worldToChunk` in `packages/math/src/chunk.ts`,
> `ChunkManager.update()` in `apps/game/src/world/ChunkManager.ts`), visibility = 2 km
> haversine on `geo` (`InterestManager` in `apps/game/src/multiplayer/interest/InterestManager.ts`,
> which stays correct across per-destination origins where raw XYZ is incomparable).
> Kept below as historical spec; see Appendix A.2.

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

> **Implemented 2026-09-23 (ratified chunk model, no grid).**
> - Same WS/session across all moves: `GameEngine.travelTo()` (`apps/game/src/game/GameEngine.ts`)
>   reuses `ChunkManager.resetToOrigin()` + `OsmStreamingManager.reset()/markCovered()` +
>   `PlayerCar.teleport()` + `GameClient.sendRespawn()` — never reconnects.
> - Far transitions share one pipeline: `_applyStreamedArea()` serves both
>   `init()` and `travelTo()` (trial-redo via `gotoTrialStart()` pins `landAt`).
> - Long drives auto-rebase the origin: `_maybeRebaseOrigin()` re-centres the
>   Mercator frame past 8 km (`REBASE_DISTANCE_M`), preserving velocity/heading
>   (`teleport(..., { preserveVelocity: true })`, `PlayerPlane.shiftBy()`), GPS
>   route and safe-spot via geo round-trips. Trials follow travel policy (aborted).

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

> **Implemented 2026-09-23 as `_applyStreamedArea()` + `travelTo()` + `_maybeRebaseOrigin()`**
> (`apps/game/src/game/GameEngine.ts`) — one far-transition pipeline for
> spawn/travel/trial-redo/rebase (no `GridPosition`; chunks are the unit).
> Local recoveries stay direct (`PlayerCar.teleport()` in `_recoverCarOnRoad()`).

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

> **Uniform pipeline 2026-09-23 — no build-time, same logic everywhere.**
> Per-destination pre-generation was removed (`pnpm build:world`, packs,
> static `chunk_<x>_<z>.json` tier, `chunkDir` plumbing and the `?offline=1`
> mode are all gone): every place on Earth loads through the single
> `OsmStreamingManager` → `/api/osm-map` → worker → `generateChunks` path.
> The location-agnostic cache is the server disk cache (`.cache/osm`,
> superset/overlap logic in `src/routes/api/osm-map.ts`), filled automatically
> as you drive — no place gets special treatment.

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

> **Progress 2026-09-23:** steps 1 (WorldPosition ✅), 4–5 (chunks + 2 km
> interest ✅), 7–9 (streaming ✅ — single uniform live pipeline, no packs)
> and 10 (tick/metrics ✅: 20 Hz server tick avg/p95 + `GET /api/mp-stats` +
> DebugOverlay) are done. Steps 2–3 (`worldToGrid`/`transitionPlayer`/grid)
> were **ratified away** — the chunk + geo-haversine model is adopted instead
> (see §4 note and Appendix A.2). Per-place pre-generation was removed by
> design (same logic everywhere); worker extraction stays deferred.

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

> **Implemented 2026-09-23:** `pnpm test` (vitest, root `vitest.config.mts`,
> workspace imports resolve to sources): 77 tests covering geo/chunk math,
> protocol round-trips, OSM filter/normalize/dedupe, chunk bucketing, RoadGraph
> + A*, geo projection, interest radius incl. cross-origin teleport,
> ChunkState lifecycle, GameServer metrics shape, and the single streaming
> path (fetch uncovered areas, empty delivery marks covered, `reset()`
> refetches). Engine-level scenarios (drive/teleport/chunk transition in 3D)
> remain manual.

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

> **Implemented 2026-09-23:** `GameServer.getMetrics()` (tick avg/p95 over a
> 240-sample window, interest-filter avg, population, msg counters;
> 30 s server log) served at `GET /api/mp-stats`
> (`apps/game/src/routes/api/mp-stats.ts`); client polls it into the
> DebugOverlay (srv tick / p95 / players) alongside chunk-stream counters
> (`ChunkManager.streamStats`: loads started/completed, unloads, queue depth).
> Covered by `GameServer.test.ts`. Still missing: historical dashboards.

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

> Status 2026-09-23 — checked against the actual game code:

- [x] MMO still runs from the existing TanStack Start repository.
- [x] No separate game server is required (`src/multiplayer/` colocated, `/api/mp` Nitro WS, same origin).
- [x] Player positions use a canonical world coordinate system (`WorldPosition`/`GeoPosition` in `packages/math/src/geo.ts`).
- [ ] Spatial grid membership is deterministic. — ❌ no `GridPosition`/`worldToGrid`; chunks (`CHUNK_SIZE = 500`, `worldToChunk` in `packages/math/src/chunk.ts`) are the spatial unit.
- [ ] Movement updates the grid correctly. — ❌ same reason; movement updates chunks via `ChunkManager.update()` + interest via haversine.
- [x] Teleportation updates the grid correctly. — ⚠️ no grid, but `GameEngine.travelTo()` + `ChunkManager.resetToOrigin()` + `OsmStreamingManager.reset()/markCovered()` + `PlayerCar.teleport()` reload the correct destination chunks without reconnect.
- [x] Teleportation does not reconnect the player.
- [x] Grid transitions do not reconnect the player. — N/A (no grid); chunk transitions never reconnect.
- [x] Chunk transitions do not reconnect the player.
- [x] Interest management limits nearby-player synchronization (`InterestManager`, `INTEREST_RADIUS = 2000`, per-tick `world_snapshot` filtering in `GameServer._tick` @ 20 Hz).
- [ ] OSM is not called during normal gameplay. — ❌ by design decision: one uniform live-streaming pipeline everywhere (no per-place packs, no offline fork). The location-agnostic buffer is the server disk cache (`.cache/osm`); an OSM outage still pauses new-area loading (§29).
- [x] World data can be served from preprocessed chunks. — ✅ via the single streaming pipeline: `/api/osm-map` (disk-cached) → worker parse → `generateChunks` → `ChunkManager`, identical for every place on Earth. No packs, no per-destination data.
- [x] PostgreSQL is not queried for every movement update. — ✅ stronger: no Postgres at all; SQLite/libsql + drizzle, realtime in memory, persistence async (settings 2 s debounce, spawn/stats 20 s).
- [x] Redis is not used as an unnecessary global world database. — ✅ no Redis dependency at all.
- [x] World streaming works transparently. (`ChunkManager` + worker-parsed OSM + ground-slab placeholder + frame-budgeted builds.)
- [x] Long-distance teleportation works transparently. (`travelTo()` keeps the same WS; UX caveat: origin re-centering, not continuous planetary coords.)
- [ ] The entire planet remains one logical world. — ⚠️ one logical world **per destination**; cross-origin MP works via `geo` (haversine interest, `RemotePlayerManager` rebasing) but XYZ frames are per-origin.
- [x] The game runtime can later be extracted without rewriting gameplay logic. (`GameServer.connect/receive/removePlayer` transport-agnostic + `MpPeer` adapter + `get-server.ts` singleton; `WorldRegion` stub for future sharding.)

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

# 36. Recommended Implementation Order

> Status 2026-09-23 — actual order taken by the game (differs from the plan):

```text
1. WorldPosition                                    ✅ packages/math/src/geo.ts
         ↓
2. worldToGrid()                                    ❌ skipped — chunks used instead
         ↓                                            (worldToChunk, CHUNK_SIZE=500)
3. transitionPlayer()                               ❌ skipped — travelTo/teleport path instead
         ↓                                            (GameEngine.travelTo, PlayerCar.teleport)
4. Fix teleportation                                ✅ fixed differently: same WS kept,
                                                      origin reset + chunk reload
         ↓
5. Spatial grid                                     ❌ replaced by chunk locality +
                                                      2km haversine interest
         ↓
6. Interest management                              ✅ InterestManager (2km, geo-aware)
         ↓
7. Chunk abstraction                                ✅ ChunkId/ChunkManager/ChunkCache/ChunkState
         ↓
8. Preprocessed OSM world data                      ⚠️ pipeline exists (world-builder),
                                                      but live OSM still primary
         ↓
9. Chunk streaming                                  ✅ ChunkManager + OsmStreamingManager +
                                                      workerized OSM parsing
         ↓
10. Runtime performance profiling                   ⚠️ DebugOverlay only, no p95/p99 pipeline
         ↓
11. Redis optimization where needed                 ➖ not needed — no Redis installed
         ↓
12. PostgreSQL persistence optimization             ➖ replaced by SQLite/libsql + drizzle,
                                                      async autosave (2s/20s)
         ↓
13. Only then consider extracting workers           ✅ runtime already logically isolated
                                                      (GameServer transport-agnostic)
```

The priority is **correctness and clean boundaries first, horizontal scaling second**.

---

# Appendix A — Implementation mapping (2026-09-23)

Audited against the real tree. Paths are relative to the repo root unless noted.

## A.1 Where the spec lives in code

| Spec concept | Actual implementation |
|---|---|
| `WorldPosition` / `GeoPosition` (§3, §27-step 1) | ✅ `packages/math/src/geo.ts:10-18`, `geoToWorld`/`worldToGeo`/`setWorldOrigin`/`getWorldOrigin`; re-exported via `packages/world-data/src/geo/projection.ts` |
| `ChunkId`, `worldToChunk`, chunk streaming (§10, §22, §27-step 7) | ✅ `packages/math/src/chunk.ts` (`CHUNK_SIZE = 500`, `worldToChunk`/`chunkToWorld`/`surroundingChunks`); `apps/game/src/world/ChunkManager.ts:update()` (radius from `src/settings/SettingsStore.ts`: load 1–4 / unload 2–6), `ChunkLoader.ts:resolveData` (cache → streamed OSM → `pending`), `ChunkCache.ts` (LRU 64), `ChunkState.ts` (`REQUESTED→LOADING→ACTIVE→UNLOADING→UNLOADED`), ground-slab placeholder + frame-budgeted `_pump/_flushReady` |
| Live world source | ⚠️ `OsmStreamingManager.ts` (`FETCH_RADIUS = 300` m, refetch 150 m, 10 m throttle, velocity lookahead) → `LiveOsmFetcher.ts` → `osm-parse.ts:fetchOsmXml` → `GET /api/osm-map` (`src/routes/api/osm-map.ts`, disk cache `.cache/osm`) with direct-OSM fallback; parsed off-thread in `osm.worker.ts` via `OsmWorkerClient.ts` |
| `GridPosition`, `worldToGrid`, `transitionPlayer` (§4–§6, §27-steps 2–3) | ❌ zero hits in `packages/*/src` and `apps/game/src` (only mentioned in this doc). No central transition; the equivalent is split across `GameEngine.travelTo()/respawnPlayer()/gotoTrialStart()`, `ChunkManager.resetToOrigin()`, `OsmStreamingManager.reset()/markCovered()`, `PlayerCar.teleport()` (`src/vehicles/PlayerCar.ts:704`), `GameClient.sendRespawn()` |
| Teleport without reconnect (§5, §7, §20, §23) | ✅ `GameEngine.travelTo(destination)` keeps the same `GameClient` WS; `FlightCamera.snap()` + `HUD` district recompute on landing; trial-redo lands via `gotoTrialStart()` + `landAt` |
| Interest management (§8, §27-step 5) | ✅ `src/multiplayer/interest/InterestManager.ts:16` (`INTEREST_RADIUS = 2000`, haversine on `geo` so per-origin XYZ stays comparable, raw-XZ fallback); enforced per tick in `GameServer._tick()` → filtered `world_snapshot` |
| Game tick (§18, §27-step 9) | ✅ server `TICK_RATE = 20` Hz (`GameServer.ts:17`), client physics `FIXED_DT = 1/60` (`GameEngine.ts:67`, `PhysicsSimulation.ts:11`), render decoupled (rAF + accumulator) |
| Realtime connection (§24) | ✅ one same-origin WS `/api/mp` (`mp-ws-handler.ts` Nitro/crossws → `GameServer.connect/receive/removePlayer`); `GameClient.ts` (join/input/state/respawn/hit/ping 2 s, backoff 1–30 s); protocol in `packages/protocol/src/messages.ts` (`join/player_input/player_state/ping/request_chunk/player_respawn/player_hit/leave` ↔ `welcome/world_snapshot/chunk/pong/player_joined/player_left/damage_taken/destroyed/error`) |
| HTTP vs realtime (§25) | ✅ HTTP/server-fns: auth, `server/profile.ts` (`getMyProfile/saveSpawn/saveSettings`), `server/stats.ts`, `server/trials.ts`, `/api/geocode` (Nominatim), `/api/osm-map`, `/api/overpass`; WS: movement/state/snapshots/combat |
| Persistence (§16–§17, §27-step 8) | ✅ SQLite/libsql + drizzle, **not** Postgres: `src/lib/db.ts`, `src/lib/db/schema.ts` (`player_profile`, `player_stats`, `player_city_visits`, `player_trophies`, `trial_times`), `src/lib/db/auth-schema.ts` (better-auth `drizzleAdapter(sqlite)` + `anonymous()`); async checkpoints via `src/services/profileSync.ts` (settings 2 s debounce, spawn/stats 20 s, `flushTripStats`) — never per-tick |
| Redis (§15) | ✅-by-absence: no `redis` dependency, no wrapper; realtime stays in `GameServer.sessions` + `PhysicsSimulation` (Rapier) + `NpcSimulation` (circular patrol) |
| OSM pipeline (§12–§14, §27-step 6) | ✅ uniform live path: `OsmStreamingManager` (300 m, throttled, worker parse) → `/api/osm-map` (disk cache `.cache/osm`, then api.openstreetmap.org) → `generateChunks`; trial radar via `POST /api/overpass`, geocode via Nominatim. No build-time, no packs, no per-place data — `world-builder` is dev-only tooling |
| Client state (§21) | ✅ local player (`PlayerCar`/`PlayerPlane`) + visible entities (`RemotePlayerManager` + `InterpolationBuffer` 100 ms/32 snaps, nametags `snap.name` else `RIVAL #id`, 5 s stale prune) + `loadedChunks` set |
| NPC traffic | ⚠️ client `NPCManager/NPCCar` present but traffic currently disabled in-engine; server `NpcSimulation` spawns 10 circular-patrol NPCs and broadcasts `npcs` |
| Auth / profiles / game extras (beyond this spec) | ➕ `src/lib/auth*.ts` + `src/ui/auth/`, guest auto-create, `WorldTravelModal` → `engine.travelTo`, `AddressSearchBar`, `Minimap`, `HUD`, time trials (`server/trials.ts`, `ui/trials/`), trophies (`server/stats.ts`, `ui/trophies/`), combat (`CombatSystem`, `player_hit`) |
| Observability (§30) | ⚠️ `src/renderer/Renderer.ts` + `DebugOverlay.tsx` (FPS, memory, draw calls, tris, chunk bounds, coords, GPS, latency, NPC count) only; no `active_players/active_cells/tick_duration/serialization_ms` pipeline, no p95/p99 |
| Tests (§29) | ❌ no `*.test.ts` in repo; teleport/cell/chunk/OSM-outage scenarios are manual |
| Future scaling (§31–§33) | ✅ runtime logically isolated and extractable (`GameServer` transport-agnostic, `get-server.ts` singleton, `WorldRegion` single `-1000..1000` stub for future sharding); no worker/gateway split yet, per plan |

## A.2 Key divergences from the spec (deliberate or pending)

1. **No spatial grid — chunks + geo-haversine instead.** There is no `GridPosition`/`worldToGrid`/`getInterestCells`. Locality = `worldToChunk` (500 m) + `surroundingChunks(loadRadius)`; visibility = 2 km haversine on `geo`. This works across per-destination origins where raw XYZ is incomparable.
2. **No `transitionPlayer()` — `travelTo()` is the transition.** Long-distance moves re-center the Mercator origin (`setWorldOrigin(destination.origin)`, `resetToOrigin`), clear caches, teleport the car, then backfill real OSM async and re-seat the car on the road centerline. Same WS/session throughout.
3. **World is continuous per destination, not planetary.** `src/world/destinations.ts` (`WORLD_DESTINATIONS` + spawn/origin) defines discrete bookmarks, never data tiers. The "one world" invariant holds for driving/streaming/MP *within* a destination; inter-city travel is a fast-travel with origin reset through the same pipeline.
4. **One pipeline, no per-place data.** Destinations are bookmarks (origin + spawn), never data tiers: `resetToOrigin()` takes only an origin, `ChunkLoader` has no static tier, and every square metre on Earth loads through the same streaming code.
5. **Postgres/Redis → SQLite/none.** Persistence is SQLite (file + URL via libsql, same `sqlite-core` schema both envs). No Redis presence/pub-sub. Correct for single-runtime scale; revisit only with multi-runtime sharding.
6. **Vite is still the dev/build tool** (`vite dev --port 5173`, `vite build`, Nitro `.output/server`), per §26's allowance — just don't describe it as the runtime.

## A.3 Suggested next migration steps (unchanged priority: boundaries first)

> **Update 2026-09-23 — all four steps below are DONE:**
>
> 1. ~~Decide `worldToGrid` + `transitionPlayer` vs current model~~ → **ratified:**
>    chunk + geo-haversine adopted (§4–§6 notes); far moves unified in
>    `GameEngine._applyStreamedArea()` (init/travel/trial-redo).
> 2. ~~Origin-shifting~~ → **done:** `_maybeRebaseOrigin()` re-centres past 8 km,
>    same WS/session, velocity preserved (`PlayerCar.teleport(..., { preserveVelocity })`,
>    `PlayerPlane.shiftBy()`), GPS/safe-spot via geo, `geoDistanceMeters()` shared helper.
> 3. ~~Reduce runtime OSM dependence~~ → **superseded 2026-09-23 by design
>    decision (same logic everywhere):** per-place packs removed entirely —
>    one uniform `OsmStreamingManager` → `/api/osm-map` (disk-cached) →
>    worker → `generateChunks` pipeline, `chunkDir` plumbing deleted,
>    `?offline=1` fork deleted. Trade-off accepted: OSM outage pauses
>    new-area loading; visited areas survive via the server disk cache.
> 4. ~~Tests + metrics~~ → **done:** `pnpm test` (80+ tests, §29 note),
>    `GameServer.getMetrics()` + `GET /api/mp-stats` + DebugOverlay rows (§30 note).

Original proposals (kept for history — all resolved as above):

1. ~~Decide whether to adopt `worldToGrid` + `transitionPlayer` or ratify the current chunk+geo model (update §§4–6 accordingly) — don't carry both.~~
2. ~~If planetary continuity is wanted: replace per-destination `resetToOrigin` with origin-shifting (or float64/relative rendering) so `travelTo` becomes a far `transitionPlayer`, not a rebase.~~
3. ~~Reduce runtime OSM dependence: prebuild + ship more `world-data/chunks` packs via `world-builder`, keep live OSM as backfill only; add an offline mode test (§29 OSM-outage).~~
4. ~~Add the missing automated tests (§29) and tick/interest/chunk-load metrics (§30) before any worker extraction (§§31–32).~~
