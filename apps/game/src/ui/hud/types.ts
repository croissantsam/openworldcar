/** Flight instruments shown in plane mode (rounded for display). */
export type FlightReadout = {
  kmh: number
  altitude: number
  verticalSpeed: number
  throttle: number
  onGround: boolean
  stall: boolean
  crashed: boolean
}

export const FLIGHT_READOUT_EMPTY: FlightReadout = {
  kmh: 0,
  altitude: 0,
  verticalSpeed: 0,
  throttle: 0,
  onGround: true,
  stall: false,
  crashed: false,
}

export function sameReadout(a: FlightReadout, b: FlightReadout): boolean {
  return (
    a.kmh === b.kmh &&
    a.altitude === b.altitude &&
    a.verticalSpeed === b.verticalSpeed &&
    a.throttle === b.throttle &&
    a.onGround === b.onGround &&
    a.stall === b.stall &&
    a.crashed === b.crashed
  )
}

/** Machine-gun readout (plane mode). */
export type GunReadout = {
  ammo: number
  maxAmmo: number
  /** 0..100 */
  heat: number
  overheated: boolean
}

export function sameGun(a: GunReadout | null, b: GunReadout | null): boolean {
  if (a === null || b === null) return a === b
  return a.ammo === b.ammo && a.maxAmmo === b.maxAmmo && a.heat === b.heat && a.overheated === b.overheated
}
