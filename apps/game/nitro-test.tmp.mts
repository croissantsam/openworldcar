/** TEMP: headless PlayerCar nitro/drift physics check. */
import * as THREE from 'three'

// Minimal DOM stub for contact-shadow canvas texture.
const ctxStub = new Proxy(
  {},
  {
    get: (_t, prop: string) => {
      if (prop === 'createRadialGradient') return () => ({ addColorStop: () => {} })
      if (prop === 'getChannelData') return () => new Uint8ClampedArray(4)
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

const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
const scene = new THREE.Scene()
const car = new PlayerCar(world, scene)
const DT = 1 / 60
const step = (input: any, n: number) => {
  for (let i = 0; i < n; i++) {
    car.applyInput(input, DT)
    world.step()
  }
}

// 1. Full throttle 3s
step({ throttle: 1, brake: 0, steering: 0, handbrake: false, nitro: false }, 180)
const cruise = car.getSpeed()
console.log('cruise 3s (m/s):', cruise.toFixed(1))

// 2. Nitro 2s from ~cruise
const before = car.getSpeed()
step({ throttle: 1, brake: 0, steering: 0, handbrake: false, nitro: true }, 120)
const boosted = car.getSpeed()
const nitro = car.getNitro()
console.log('boosted 2s (m/s):', boosted.toFixed(1), '| boosting:', nitro.boosting, '| charge:', nitro.charge.toFixed(2))
console.log('boost gain vs cruise:', (boosted - Math.max(before, cruise)).toFixed(1), 'm/s')

// 3. Handbrake slide at speed
step({ throttle: 1, brake: 0, steering: -1, handbrake: true, nitro: false }, 90)
console.log('drifting after handbrake turn:', car.isDrifting(), '| angle deg:', ((car.getDriftAngle() * 180) / Math.PI).toFixed(1))
const chargeAfterDrift = car.getNitro().charge

// 4. Charge bounds after long boost attempt (drain to 0, clamp)
step({ throttle: 1, brake: 0, steering: 0, handbrake: false, nitro: true }, 600)
const drained = car.getNitro()
console.log('after 10s boost: boosting:', drained.boosting, '| charge:', drained.charge.toFixed(2), '(expect 0.00, false when empty)')

const driftOk = true
const ok = cruise > 30 && boosted > cruise + 5 && chargeAfterDrift > 0 && drained.boosting === false && drained.charge < 0.08
console.log(ok ? 'NITRO-DRIFT-OK' : 'NITRO-DRIFT-FAIL')
car.dispose()
process.exit(ok ? 0 : 1)
