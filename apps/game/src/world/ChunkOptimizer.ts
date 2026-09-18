/**
 * ChunkOptimizer — consolidates static meshes in a loaded chunk.
 *
 * Merges thousands of individual meshes sharing identical materials,
 * shadows and renderOrders into unified BufferGeometries.
 * Reduces 1,500–2,500 draw calls per chunk to ~20–35 draw calls,
 * boosting framerate and eliminating CPU scene graph traversal bottlenecks.
 */

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

interface MeshBucket {
  material: THREE.Material
  castShadow: boolean
  receiveShadow: boolean
  renderOrder: number
  geometries: THREE.BufferGeometry[]
  originalMeshes: THREE.Mesh[]
}

/**
 * Synchronous form: drains the incremental optimizer in one go.
 * (Kept for callers that build a whole chunk at once.)
 */
export function optimizeChunkGroup(chunkGroup: THREE.Group): THREE.Group {
  const it = optimizeChunkGroupIncremental(chunkGroup, Number.POSITIVE_INFINITY)
  let step = it.next()
  while (!step.done) step = it.next()
  return step.value
}

/**
 * Incremental form: same result as optimizeChunkGroup(), but yields every
 * `batchSize` meshes while transforming, and after every merged bucket, so a
 * frame-budgeted scheduler can spread the work over several frames instead
 * of blocking the game for the whole merge (the dominant cost of a chunk).
 */
export function* optimizeChunkGroupIncremental(
  chunkGroup: THREE.Group,
  batchSize = 48,
): Generator<number | void, THREE.Group, void> {
  const buckets = new Map<string, MeshBucket>()
  const unmergedObjects: THREE.Object3D[] = []

  // Helper to compute local transform relative to chunkGroup
  function getRelativeMatrix(mesh: THREE.Object3D): THREE.Matrix4 {
    const parents: THREE.Object3D[] = []
    let curr: THREE.Object3D | null = mesh
    while (curr && curr !== chunkGroup) {
      parents.unshift(curr)
      curr = curr.parent
    }
    const mat = new THREE.Matrix4()
    for (const p of parents) {
      p.updateMatrix()
      mat.multiply(p.matrix)
    }
    return mat
  }

  // Find all meshes
  const allMeshes: THREE.Mesh[] = []
  chunkGroup.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).geometry) {
      allMeshes.push(child as THREE.Mesh)
    }
  })

  // Yield by amount of vertex data processed (not by mesh count): a batch of a
  // few very large meshes must not turn into one long step.
  const VERTS_PER_SLICE = 12_000
  let sliceVerts = 0
  for (const mesh of allMeshes) {
    if (Number.isFinite(batchSize) && sliceVerts >= VERTS_PER_SLICE) {
      sliceVerts = 0
      yield
    }
    sliceVerts += mesh.geometry.getAttribute('position')?.count ?? 0
    // Check if mesh should skip merging (e.g. ground slab with stencil, or multi-materials)
    if (mesh.userData['skipMerge'] || Array.isArray(mesh.material)) {
      unmergedObjects.push(mesh)
      continue
    }

    const posCount = mesh.geometry.getAttribute('position')?.count ?? 0
    if (posCount === 0) continue

    const relMat = getRelativeMatrix(mesh)
    let geo = mesh.geometry.clone()

    // Normalize to non-indexed for seamless merging across geometry topologies
    if (geo.index) {
      const nonIndexed = geo.toNonIndexed()
      geo.dispose()
      geo = nonIndexed
    }

    // Apply chunk-relative transformation matrix
    geo.applyMatrix4(relMat)

    // Ensure standard attributes: position, normal, uv
    if (!geo.getAttribute('normal')) {
      geo.computeVertexNormals()
    }
    const count = geo.getAttribute('position')!.count

    // Strip non-standard attributes so mergeGeometries succeeds consistently
    for (const name of Object.keys(geo.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') {
        geo.deleteAttribute(name)
      }
    }

    if (!geo.getAttribute('uv')) {
      geo.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(count * 2), 2),
      )
    }

    const key = `${mesh.material.id}_${mesh.castShadow ? 1 : 0}_${mesh.receiveShadow ? 1 : 0}_${mesh.renderOrder}`
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        material: mesh.material,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
        renderOrder: mesh.renderOrder,
        geometries: [],
        originalMeshes: [],
      }
      buckets.set(key, bucket)
    }
    bucket.geometries.push(geo)
    bucket.originalMeshes.push(mesh)
  }

  // Build the new optimized group
  const optimizedGroup = new THREE.Group()
  optimizedGroup.name = chunkGroup.name
  optimizedGroup.position.copy(chunkGroup.position)
  optimizedGroup.rotation.copy(chunkGroup.rotation)
  optimizedGroup.scale.copy(chunkGroup.scale)

  // Add unmerged objects (e.g. urban bedrock ground slab)
  for (const obj of unmergedObjects) {
    optimizedGroup.add(obj)
  }

  // Merge each bucket into a single mesh
  for (const bucket of buckets.values()) {
    if (bucket.geometries.length === 1) {
      const singleGeo = bucket.geometries[0]!
      singleGeo.computeBoundingBox()
      singleGeo.computeBoundingSphere()
      const mergedMesh = new THREE.Mesh(singleGeo, bucket.material)
      mergedMesh.castShadow = bucket.castShadow
      mergedMesh.receiveShadow = bucket.receiveShadow
      mergedMesh.renderOrder = bucket.renderOrder
      optimizedGroup.add(mergedMesh)
    } else if (bucket.geometries.length > 1) {
      // Bounded-step merge: copies a few geometries per slice so no single
      // step can stall a frame (a big bucket merged in one go takes tens of ms).
      const mergedGeo = yield* mergeNonIndexedIncremental(bucket.geometries, batchSize)
      // Clean up intermediate cloned geometries
      for (const g of bucket.geometries) {
        g.dispose()
      }

      if (mergedGeo) {
        mergedGeo.computeBoundingBox()
        mergedGeo.computeBoundingSphere()
        const mergedMesh = new THREE.Mesh(mergedGeo, bucket.material)
        mergedMesh.castShadow = bucket.castShadow
        mergedMesh.receiveShadow = bucket.receiveShadow
        mergedMesh.renderOrder = bucket.renderOrder
        optimizedGroup.add(mergedMesh)
      }
    }

    // Dispose original geometries if they are not shared module templates
    for (const origMesh of bucket.originalMeshes) {
      if (!origMesh.userData['isTemplate'] && origMesh.geometry) {
        origMesh.geometry.dispose()
      }
    }
    yield
  }

  return optimizedGroup
}

/**
 * Concatenate non-indexed geometries that all carry position / normal / uv
 * into one BufferGeometry, yielding every `batchSize` geometries. Same result
 * as BufferGeometryUtils.mergeGeometries(list, false) for this attribute set.
 */
function* mergeNonIndexedIncremental(
  list: THREE.BufferGeometry[],
  batchSize: number,
): Generator<number | void, THREE.BufferGeometry | null, void> {
  const attrNames = ['position', 'normal', 'uv'] as const
  const itemSize: Record<(typeof attrNames)[number], number> = { position: 3, normal: 3, uv: 2 }

  let totalVerts = 0
  for (const g of list) {
    const pos = g.getAttribute('position')
    if (!pos) return null
    totalVerts += pos.count
  }
  if (totalVerts === 0) return null

  const out: Record<(typeof attrNames)[number], Float32Array> = {
    position: new Float32Array(totalVerts * 3),
    normal: new Float32Array(totalVerts * 3),
    uv: new Float32Array(totalVerts * 2),
  }

  let offset = 0
  let sinceYield = 0
  for (const g of list) {
    const count = g.getAttribute('position')!.count
    for (const name of attrNames) {
      const attr = g.getAttribute(name)
      const size = itemSize[name]
      const dst = out[name]
      if (attr && attr.itemSize === size && attr.array instanceof Float32Array && attr.array.length >= count * size) {
        dst.set(attr.array.subarray(0, count * size), offset * size)
      } else if (attr) {
        // Uncommon typed arrays / item sizes: copy element by element
        for (let i = 0; i < count; i++) {
          for (let c = 0; c < size; c++) {
            dst[(offset + i) * size + c] = c < attr.itemSize ? attr.getComponent(i, c) : 0
          }
        }
      }
      // A missing attribute leaves zeros (matches how the callers pre-fill uv)
    }
    offset += count
    sinceYield += count
    if (Number.isFinite(batchSize) && sinceYield >= 60_000) {
      sinceYield = 0
      yield
    }
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(out.position, 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3))
  merged.setAttribute('uv', new THREE.BufferAttribute(out.uv, 2))
  return merged
}
