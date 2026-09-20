import { resamplePolyline, type Pt } from './geometry.js'

const GROUND_Y = 0.028

export interface ElevationProfile {
  points: Pt[]
  totalLength: number
  rampLength: number
}

export function computeElevatedBridgePoints(
  rawPts: Pt[],
  bridgeHeight = 4.5,
  connectsStart = false,
  connectsEnd = false,
): ElevationProfile {
  const pts = resamplePolyline(rawPts, 2.0)
  const N = pts.length
  if (N < 2) return { points: rawPts, totalLength: 0, rampLength: 0 }

  const dists = [0]
  let totalL = 0
  for (let i = 0; i < N - 1; i++) {
    const d = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z)
    totalL += d
    dists.push(totalL)
  }

  const rampL = Math.max(6.0, Math.min(22.0, totalL * 0.28))

  const elevated = pts.map((p, i) => {
    const s = dists[i]!
    let y = GROUND_Y

    if (connectsStart && connectsEnd) {
      y = bridgeHeight
    } else if (connectsStart) {
      if (s > totalL - rampL) {
        const t = (totalL - s) / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * factor
      } else {
        y = bridgeHeight
      }
    } else if (connectsEnd) {
      if (s < rampL) {
        const t = s / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * factor
      } else {
        y = bridgeHeight
      }
    } else {
      if (totalL <= rampL * 2) {
        const t = s / totalL
        const arch = Math.sin(Math.PI * t)
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * arch
      } else if (s < rampL) {
        const t = s / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * factor
      } else if (s > totalL - rampL) {
        const t = (totalL - s) / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (bridgeHeight - GROUND_Y) * factor
      } else {
        const spanT = (s - rampL) / (totalL - rampL * 2)
        const crown = Math.sin(Math.PI * spanT) * 0.20
        y = bridgeHeight + crown
      }
    }

    return { x: p.x, y, z: p.z }
  })

  return { points: elevated, totalLength: totalL, rampLength: rampL }
}

export function computeTunnelPoints(
  rawPts: Pt[],
  tunnelDepth = -4.8,
  connectsStart = false,
  connectsEnd = false,
): ElevationProfile {
  const pts = resamplePolyline(rawPts, 2.0)
  const N = pts.length
  if (N < 2) return { points: rawPts, totalLength: 0, rampLength: 0 }

  const dists = [0]
  let totalL = 0
  for (let i = 0; i < N - 1; i++) {
    const d = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.z - pts[i]!.z)
    totalL += d
    dists.push(totalL)
  }

  const rampL = Math.max(14.0, Math.min(34.0, totalL * 0.28))

  const tunnelPoints = pts.map((p, i) => {
    const s = dists[i]!
    let y = GROUND_Y

    if (connectsStart && connectsEnd) {
      y = tunnelDepth
    } else if (connectsStart) {
      if (s > totalL - rampL) {
        const t = (totalL - s) / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * factor
      } else {
        y = tunnelDepth
      }
    } else if (connectsEnd) {
      if (s < rampL) {
        const t = s / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * factor
      } else {
        y = tunnelDepth
      }
    } else {
      if (totalL <= rampL * 2) {
        const t = s / totalL
        const dip = Math.sin(Math.PI * t)
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * dip
      } else if (s < rampL) {
        const t = s / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * factor
      } else if (s > totalL - rampL) {
        const t = (totalL - s) / rampL
        const factor = 0.5 * (1 - Math.cos(Math.PI * t))
        y = GROUND_Y + (tunnelDepth - GROUND_Y) * factor
      } else {
        y = tunnelDepth
      }
    }

    return { x: p.x, y, z: p.z }
  })

  return { points: tunnelPoints, totalLength: totalL, rampLength: rampL }
}