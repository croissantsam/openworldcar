#!/usr/bin/env node
/**
 * world-builder CLI
 *
 * Fetches OSM data for a bounding box and writes chunk JSON files.
 *
 * Usage:
 *   node dist/index.js --lat 48.8648 --lon 2.349 --radius 1500 --out ../../data/development
 *
 * This will fetch ~3×3 km around Paris 2e and write one JSON file per chunk.
 */

import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import {
  setWorldOrigin,
  DEFAULT_ORIGIN,
  geoToWorld,
  chunkKey,
} from '@world-drive/math'
import {
  fetchOsmData,
  normalizeRoad,
  normalizeBuilding,
  normalizePoi,
  normalizeWaterway,
  generateChunks,
  geoBoundingBox,
  deduplicateBuildings,
} from '@world-drive/world-data'
import type { RawOsmWay, RawOsmNode } from '@world-drive/world-data'

// ─── CLI args ─────────────────────────────────────────────────────────────────

function parseArgs(): {
  lat: number
  lon: number
  radius: number
  out: string
} {
  const args = process.argv.slice(2)
  const get = (flag: string, def: string): string => {
    const idx = args.indexOf(flag)
    return idx !== -1 && args[idx + 1] ? args[idx + 1]! : def
  }
  const rawOut = get('--out', 'apps/game/public/chunks')
  const workspaceRoot = existsSync(join(process.cwd(), 'apps'))
    ? process.cwd()
    : resolve(process.cwd(), '../..')
  return {
    lat: parseFloat(get('--lat', String(DEFAULT_ORIGIN.latitude))),
    lon: parseFloat(get('--lon', String(DEFAULT_ORIGIN.longitude))),
    radius: parseInt(get('--radius', '1500'), 10),
    out: resolve(workspaceRoot, rawOut),
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { lat, lon, radius, out } = parseArgs()

  const origin = { latitude: lat, longitude: lon }
  setWorldOrigin(origin)

  console.log(`🌍 Origin: ${lat}, ${lon}`)
  console.log(`📐 Radius: ${radius}m`)

  const [south, west, north, east] = geoBoundingBox(origin, radius)
  console.log(`🗺  Bbox: ${south.toFixed(5)},${west.toFixed(5)} → ${north.toFixed(5)},${east.toFixed(5)}`)
  console.log('⏳ Fetching OSM data (Overpass)…')

  const osmData = await fetchOsmData({ south, west, north, east })
  console.log(`✅ Got ${osmData.elements.length} elements`)

  // Normalize elements
  const roads = []
  const buildings = []
  const pois = []
  const waterways = []

  for (const el of osmData.elements) {
    if (el.type === 'way' && el.geometry) {
      const coords: [number, number][] = el.geometry.map((g) => [g.lon, g.lat])
      const raw: RawOsmWay = {
        id: String(el.id),
        tags: el.tags ?? {},
        coords,
      }
      // Try all normalizations - a way can have multiple feature types
      const road = normalizeRoad(raw)
      if (road) roads.push(road)
      const building = normalizeBuilding(raw)
      if (building) buildings.push(building)
      const waterway = normalizeWaterway(raw)
      if (waterway) {
        waterways.push(waterway)
        if (waterways.length <= 5) {
          console.log(`  Waterway ${waterway.id}: type=${waterway.type}, name=${waterway.name ?? 'none'}, points=${waterway.points.length}, isPolygon=${waterway.isPolygon}, width=${waterway.width}`)
          if (waterway.points.length > 0) {
            console.log(`    First point: x=${waterway.points[0]!.x.toFixed(1)}, z=${waterway.points[0]!.z.toFixed(1)}`)
          }
        }
      }
    }
    if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
      const raw: RawOsmNode = {
        id: String(el.id),
        tags: el.tags ?? {},
        lat: el.lat,
        lon: el.lon,
      }
      const worldPos = geoToWorld({ latitude: el.lat, longitude: el.lon })
      const poi = normalizePoi(raw, worldPos)
      if (poi) pois.push(poi)
    }
  }

  console.log(`🛣  Roads: ${roads.length}`)
  console.log(`💧 Waterways: ${waterways.length}`)
  const cleanBuildings = deduplicateBuildings(buildings)
  console.log(`🏢 Buildings: ${cleanBuildings.length} (deduplicated from ${buildings.length})`)
  console.log(`📍 POIs: ${pois.length}`)

  const chunkMap = generateChunks(roads, cleanBuildings, pois, waterways)

  await mkdir(out, { recursive: true })

  let written = 0
  for (const [key, chunk] of chunkMap) {
    const filename = join(out, `chunk_${key.replace(/:/g, '_')}.json`)
    await writeFile(filename, JSON.stringify(chunk, null, 2), 'utf8')
    written++
  }

  // Write origin manifest
  const manifest = {
    origin: { latitude: lat, longitude: lon },
    radius,
    chunkCount: written,
    generatedAt: new Date().toISOString(),
  }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2))

  console.log(`\n✨ Done! Wrote ${written} chunks to ${out}/`)
}

main().catch((err) => {
  console.error('❌', err)
  process.exit(1)
})
