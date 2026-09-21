/** TEMP: handbrake slide intensity check. */
import * as THREE from 'three'

const ctxStub = new Proxy(
  {},
  {
    get: (_t, prop: string) => {
      if (prop === 'createRadialGradient') return () => ({ addColorStop: () => {} })
      if (prop === 'canvas') return {}
      return () => {}
    },
  },
)
;(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }),
}
;(globalThis as any).window = globalThis

const RAPIER = (await import('@dimforge/rapier3d-compat')).default
await RAPIER.init()
const { PlayerCar } = await import('./src/vehicles/PlayerCar.js')
const DT = 1 / 60
const flat = { throttle: 1, brake: 0, steering: 0, handbrake: false, nitro: false }

async function scenario(label: string, drive: any, ticks: number) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const scene = new THREE.Scene()
  const car = new PlayerCar(world, scene)
  for (let i = 0; i < 180; i++) { car.applyInput(flat, DT); world.step() }
  const startYaw = car.getYaw()
  let peakLat = 0
  let driftFrames = 0
  for (let i = 0; i < ticks; i++) {
    car.applyInput(drive, DT)
    world.step()
    const v = car.getVelocity()
    const right = car.getRightVector()
    const lat = Math.abs(v.x * right.x + v.z * right.z)
    if (lat > peakLat) peakLat = lat
    if (car.isDrifting()) driftFrames++
  }
  const dYaw = ((car.getYaw() - startYaw) * 180) / Math.PI
  console.log(`${label}: peakLat=${peakLat.toFixed(2)} driftFrames=${driftFrames}/${ticks} speed=${car.getSpeed().toFixed(1)} dYaw=${dYaw.toFixed(0)}°`)
  car.dispose()
}

await scenario('handbrake+steer 3s', { ...flat, steering: -1, handbrake: true }, 180)
await scenario('steer only 2s', { ...flat, steering: -1 }, 120)
await scenario('handbrake straight 2s', { ...flat, handbrake: true }, 120)
process.exit(0)
