# World Drive

An open-world driving game built on real OpenStreetMap data. The goal is to create a scalable architecture that can eventually support a global world, starting with a V1 that proves the core concept: driving freely in a real-world map with chunk streaming, NPC traffic, and multiplayer — all in TypeScript/JavaScript.

**Key Principle**: Architecture and performance over graphics.

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9

### Installation

```bash
# Install all dependencies
pnpm install

# Build all packages
pnpm build

# Run both client and server in parallel
pnpm dev
```

The game will be available at `http://localhost:5173` (Vite default).

---

## Project Structure

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

---

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm dev` | Run client + server in parallel |
| `pnpm build` | Build all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm lint` | Lint all packages (if configured) |
| `pnpm clean` | Remove all dist folders |

### Individual App Commands

```bash
# Client only
cd apps/game && pnpm dev

# Server only
cd apps/server && pnpm dev

# World builder (process OSM data)
cd scripts/world-builder && pnpm start
```

---

## Architecture Overview

### Core Concepts

1. **Chunk System** — World divided into square chunks. Player loads current + adjacent chunks + lookahead in movement direction.

2. **Coordinate Systems** — Three systems with deterministic conversions:
   - `GeoPosition` (lat/lon) → GPS coordinates
   - `WorldPosition` (x, y, z) → Three.js world coordinates (meters)
   - `ChunkId` (x, z, level) → Discrete chunk grid

3. **OSM Data Pipeline (Offline)** — Never call Overpass API during gameplay:
   ```
   OSM PBF → Parser → Filter → Normalize → Chunk Generator → Serialized Game Data
   ```

4. **Road Graph** — Used for NPC navigation, GPS, missions, traffic simulation.

5. **Authoritative Multiplayer** — Client sends inputs, server runs physics, broadcasts snapshots.

6. **Rendering Performance** — Frustum culling, LOD, instancing, shared geometries/materials.

---

## V1 Implementation Phases

| Phase | Focus | Goal |
|-------|-------|------|
| 1 | Engine | Three.js + Renderer + Game Loop + Camera + Input |
| 2 | Car | Rapier + Car Controller + Camera Follow + Collision |
| 3 | OSM | Parser + Projection + Road/Building Generators |
| 4 | Chunks | ChunkManager + ChunkLoader + ChunkCache + LOD |
| 5 | Traffic | RoadGraph + NPC + Pathfinding + Simulation |
| 6 | Multiplayer | WebSocket + GameServer + Input + Snapshots + Interpolation |
| 7 | Optimization | Measure → optimize draw calls, triangles, memory, bandwidth, GC |

---

## Tech Stack

### Frontend (apps/game)
- React 18
- Three.js (r168)
- Vite
- Rapier3D (physics)
- TanStack Router

### Backend (apps/server)
- Node.js
- TypeScript
- `ws` (WebSocket)
- Rapier3D (authoritative physics)

### Shared Packages
- `@world-drive/math` — Geo projections, chunk math
- `@world-drive/protocol` — Network message types
- `@world-drive/shared` — Entity/world/chunk types
- `@world-drive/world-data` — OSM pipeline, chunk generation

---

## World Data Pipeline

To generate game data from OpenStreetMap:

1. Download an OSM PBF file for your region (e.g., from Geofabrik)
2. Place it in `scripts/world-builder/data/`
3. Run the world builder:
   ```bash
   cd scripts/world-builder && pnpm start
   ```
4. Generated chunks will be output to `apps/game/public/chunks/`

---

## Development Guidelines

- **Follow `instruction.md`** — Single source of truth for V1 scope
- **No over-engineering** — V1 stays small
- **Performance first** — Architecture over graphics, performance over features
- **Deterministic geo math** — Use `packages/math` for all conversions
- **Shared types only** — Network types in `@world-drive/protocol`, never duplicate
- **Async streaming** — Never block render loop
- **Fixed timestep** — Physics at 1/60s, render at any FPS

---

## Debug Tools

Press `D` in-game to toggle debug overlay showing:
- FPS, memory, draw calls, triangles
- Current chunk, loaded chunks
- Player coordinates (world + GPS)
- Network latency
- Players nearby, NPC count
- Chunk boundaries

---

## Documentation

- **Full V1 Spec**: [`instruction.md`](instruction.md) — 36 sections, read it
- **Agent Instructions**: [`AGENTS.md`](AGENTS.md) — For AI agents working on the repo
- **OSM Tags Reference**: [`openstreetmap_tags_reference_3d.txt`](openstreetmap_tags_reference_3d.txt)

---

## License

MIT