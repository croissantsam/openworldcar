# World Drive — Agent Instructions

This document provides essential context for AI agents working on the **World Drive** open-world driving game repository.

---

## Project Overview

**World Drive** is an open-world driving game built on real OpenStreetMap data. The goal is to create a scalable architecture that can eventually support a global world, starting with a V1 that proves the core concept: driving freely in a real-world map with chunk streaming, NPC traffic, and multiplayer — all in TypeScript/JavaScript.

**Key Principle**: Architecture and performance over graphics. The V1 must prove the technical feasibility of streaming OSM-based worlds at scale.

---

## Monorepo Structure

```
world-drive/
├── apps/
│   ├── game/          # Frontend: React + Three.js + Vite
│   └── server/        # Backend: Node.js + WebSocket + Rapier
├── packages/
│   ├── math/          # Geo projections, chunk math, vector utilities
│   ├── protocol/      # Shared network message types (client ↔ server)
│   ├── shared/        # Shared types: entities, world, chunk definitions
│   └── world-data/    # OSM parsing, filtering, normalization, chunk generation
├── scripts/
│   └── world-builder/ # CLI tool to process OSM PBF → game chunks
├── package.json       # Root workspace config (pnpm)
├── pnpm-workspace.yaml
└── instruction.md     # Full V1 specification (source of truth)
```

**Package Manager**: pnpm (v9+), Node ≥20

---

## Core Architecture Concepts

### 1. Chunk System
- World divided into square chunks (`ChunkId = { x, z, level }`)
- Player loads: current chunk + adjacent chunks + lookahead in movement direction
- Far chunks unloaded automatically via `ChunkManager`
- State machine: `requested → loading → loaded → active → unloading → unloaded`

### 2. Coordinate Systems
- **GeoPosition**: `{ latitude, longitude }` — GPS coordinates
- **WorldPosition**: `{ x, y, z }` — Three.js world coordinates (meters)
- **ChunkId**: `{ x, z, level }` — Discrete chunk grid
- Deterministic conversions: `geoToWorld()`, `worldToGeo()`, `worldToChunk()`, `chunkToWorld()`
- Local origin for V1 to avoid floating-point precision issues; architecture supports origin shifting

### 3. OSM Data Pipeline (Offline)
```
OSM PBF → Parser → Filter → Normalize → Chunk Generator → Serialized Game Data
```
- **Never** call Overpass API during gameplay
- Extracts: roads (highway, lanes, maxspeed, bridge, tunnel), buildings (levels, height), POIs
- Output: `SerializedChunk` with pre-transformed meshes/data for client consumption

### 4. Road Graph
- `RoadGraph = { nodes: Map<id, RoadNode>, edges: Map<id, RoadEdge> }`
- Used for: NPC navigation, GPS, missions, traffic simulation
- Built during world-data pipeline

### 5. Multiplayer (Authoritative Server)
- Client sends `PlayerInput { throttle, brake, steering, timestamp }`
- Server runs physics (Rapier) → broadcasts `world_snapshot`
- **Interest Management**: Only nearby players/entities sent (2km radius in V1)
- **Interpolation**: Remote players smoothed via interpolation buffer
- **Local Prediction**: Simple client-side prediction with server reconciliation

### 6. Rendering Performance
- Frustum culling, LOD (0-200m HIGH, 200-800m MEDIUM, 800m+ LOW)
- Instancing for repeated objects (NPCs, buildings, road segments)
- Shared geometries/materials, texture atlases, GLTF/GLB
- Object pools for NPC vehicles

---

## Key Packages

| Package | Purpose | Key Exports |
|---------|---------|-------------|
| `@world-drive/math` | Geo projections, chunk math, vector ops | `geoToWorld`, `worldToChunk`, `ChunkId`, `WorldPosition` |
| `@world-drive/protocol` | Network message types (shared) | `ClientMessage`, `ServerMessage`, `PlayerInput`, `PlayerSnapshot` |
| `@world-drive/shared` | Entity types, world types, chunk types | `WorldChunk`, `Road`, `Building`, `Vehicle`, `Player` |
| `@world-drive/world-data` | OSM pipeline, chunk generation | `parseOsm`, `generateChunk`, `RoadGraph`, `RoadMeshGenerator` |

---

## Apps

### `@world-drive/game` (Client)
- **Stack**: React 19, Three.js (r168), TanStack Start, Rapier3D, TanStack Router
- **Entry**: `src/router.tsx` → `src/routes/__root.tsx` → `src/routes/index.tsx` → `App.tsx` → `GameEngine`
- **Core Systems**:
  - `GameEngine` — main loop, fixed timestep (1/60s)
  - `ChunkManager` — streaming, LOD, load/unload
  - `Renderer` — Three.js scene, instancing, materials
  - `PlayerCar` — Rapier vehicle physics, input handling
  - `ThirdPersonCamera` — smooth follow, orbital control, speed-adaptive distance
  - `NPCManager` / `NPCCar` — road-graph-following traffic
  - `RemotePlayerManager` — interpolated remote players
  - `GameClient` — WebSocket, input send, snapshot receive
  - `Auth` — Better Auth (email/password + anonymous guest), SQLite + drizzle; `player_profile` table (spawn, destination snapshot, settings JSON); server fns in `src/server/profile.ts`; guest auto-created on first launch, autosaved (settings 2s debounce, spawn 20s)
  - UI: `HUD`, `Minimap`, `TouchControls`, `AddressSearchBar`, `WorldTravelModal`, `DebugOverlay`

### `@world-drive/server` (Server)
- **Stack**: Node.js, TypeScript, `ws` (WebSocket), Rapier3D
- **Entry**: `src/index.ts` → `GameServer`
- **Core Systems**:
  - `GameServer` — connection handling, tick loop, broadcast
  - `WorldRegion` — spatial partitioning for future sharding
  - `InterestManager` — per-player entity visibility
  - `MessageHandler` — protocol parsing, validation
  - `PlayerSession` — auth, state, input queue
  - `PhysicsSimulation` — authoritative Rapier step
  - `NpcSimulation` — server-side NPC traffic

---

## Development Commands

```bash
# Install deps
pnpm install

# Run both client + server in parallel
pnpm dev

# Type-check all packages
pnpm typecheck

# Build all packages
pnpm build

# Lint (if configured)
pnpm lint

# Clean all dist folders
pnpm clean

# World builder (process OSM data)
cd scripts/world-builder && pnpm start
```

---

## V1 Implementation Phases (from instruction.md)

| Phase | Focus | Goal |
|-------|-------|------|
| 1 | Engine | Three.js + Renderer + Game Loop + Camera + Input → 🚗 in empty scene |
| 2 | Car | Rapier + Car Controller + Camera Follow + Collision → 🚗 driving |
| 3 | OSM | Parser + Projection + Road/Building Generators → 🚗 in real area |
| 4 | Chunks | ChunkManager + ChunkLoader + ChunkCache + LOD → 🚗 chunk→chunk streaming |
| 5 | Traffic | RoadGraph + NPC + Pathfinding + Simulation → 🚗🚗🚗🚗 |
| 6 | Multiplayer | WebSocket + GameServer + Input + Snapshots + Interpolation + Interest → 👤🚗 👤🚗 |
| 7 | Optimization | Measure → optimize draw calls, triangles, memory, bandwidth, GC |

---

## Critical Rules for Agents

1. **Follow `instruction.md`** — It is the single source of truth for V1 scope and architecture.
2. **No over-engineering** — V1 stays small. No microservices, K8s, complex matchmaking, economy, weather, day/night.
3. **No architectural debt** — Code organized around: `World`, `Chunk`, `Entity`, `Player`, `Vehicle`, `Road`, `Server`, `Client` — not around the test area.
4. **Performance first** — If choosing between features vs performance, choose performance. If graphics vs architecture, choose architecture.
5. **Deterministic geo math** — Same GPS → same world position. Use `packages/math` for all conversions.
6. **Shared types only** — Network protocol types live in `@world-drive/protocol`. Never duplicate.
7. **Async streaming** — Never block render loop. Chunk loading is async with progressive processing.
8. **Fixed timestep** — Physics at 1/60s. Render at any FPS (60/120/144).
9. **Debug tools** — Always maintain: FPS, memory, draw calls, triangles, chunk bounds, player coords, GPS, latency, NPC count.

---

## Common Tasks

### Adding a New Network Message
1. Add type to `packages/protocol/src/messages.ts`
2. Export from `packages/protocol/src/index.ts`
3. Run `pnpm build` in protocol package
4. Use in `apps/game/src/networking/GameClient.ts` and `apps/server/src/networking/MessageHandler.ts`

### Adding a New Chunk Data Type
1. Define in `packages/shared/src/types/world.ts`
2. Update serializer in `packages/world-data/src/chunk/generator.ts`
3. Handle in client `ChunkLoader` and renderer

### Modifying Vehicle Physics
- Client: `apps/game/src/vehicles/PlayerCar.ts` (Rapier vehicle config)
- Server: `apps/server/src/simulation/PhysicsSimulation.ts` (authoritative step)

### Adding OSM Tag Support
1. Update filter in `packages/world-data/src/osm/filter.ts`
2. Update normalize in `packages/world-data/src/osm/normalize.ts`
3. Update generators (RoadMeshGenerator, BuildingMeshGenerator, etc.)

---

## Testing the World

- Test area: Small real-world zone (dev only — engine must NOT be coded for it)
- Must support: multiple chunks, intersections, varied roads, buildings, chunk transitions, traffic, multiplayer
- Run world-builder to generate test data from OSM PBF

---

## References

- **Full Spec**: `instruction.md` (36 sections, read it)
- **OSM Tags Reference**: `openstreetmap_tags_reference_3d.txt`
- **Protocol Definitions**: `packages/protocol/src/messages.ts`
- **Shared Types**: `packages/shared/src/types/`
- **Math Utilities**: `packages/math/src/`

---

## Quick Start for New Agents

1. Read `instruction.md` completely
2. Run `pnpm install && pnpm dev` to verify setup
3. Explore `apps/game/src/game/GameEngine.ts` — main loop entry point
4. Explore `apps/server/src/GameServer.ts` — server entry point
5. Check `packages/math/src/geo.ts` — coordinate conversions
6. Check `packages/protocol/src/messages.ts` — network contract