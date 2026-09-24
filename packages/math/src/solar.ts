/**
 * Real-world solar position (day/night cycle).
 *
 * Given a WGS84 position and a UTC instant, returns the Sun's elevation and
 * azimuth using the standard low-precision NOAA approximation (equation of
 * time + solar declination + hour angle). Accurate to ~0.5°, plenty for
 * driving the scene lighting: the same UTC instant yields a different Sun
 * in Paris and Tokyo, so teleporting across timezones changes the light.
 *
 * Pure math, no DOM / rendering imports — safe for tests and workers.
 */

export type SolarPosition = {
  /** Degrees above (+) or below (−) the horizon. */
  elevationDeg: number
  /** Degrees clockwise from true north (0 = N, 90 = E, 180 = S, 270 = W). */
  azimuthDeg: number
}

const DEG = Math.PI / 180

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  return Math.floor((date.getTime() - start) / 86_400_000)
}

/**
 * Sun elevation/azimuth for `latitude`/`longitude` at UTC instant `at`.
 */
export function solarPosition(latitude: number, longitude: number, at: Date): SolarPosition {
  const latRad = latitude * DEG
  const hourUtc = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear(at) - 1 + (hourUtc - 12) / 24)

  // Equation of time (minutes) + solar declination (radians).
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma))
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma)

  // True solar time (minutes) from longitude: 4 min per degree east.
  const solarMinutes = hourUtc * 60 + eqTime + 4 * longitude
  const hourAngle = (solarMinutes / 4 - 180) * DEG

  const cosZenith =
    Math.sin(latRad) * Math.sin(decl) + Math.cos(latRad) * Math.cos(decl) * Math.cos(hourAngle)
  const elevationDeg = 90 - Math.acos(Math.min(1, Math.max(-1, cosZenith))) / DEG

  const azRad = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latRad) - Math.tan(decl) * Math.cos(latRad),
  )
  const azimuthDeg = (azRad / DEG + 180 + 360) % 360

  return { elevationDeg, azimuthDeg }
}

/**
 * Local mean solar time at `longitude` for UTC instant `at`, as "HH:MM".
 * 15° east = +1 h. This is the "real hour of the place".
 */
export function solarTimeString(longitude: number, at: Date): string {
  const utcMinutes = at.getUTCHours() * 60 + at.getUTCMinutes()
  const local = (((utcMinutes + longitude * 4) % 1440) + 1440) % 1440
  const h = Math.floor(local / 60)
  const m = Math.floor(local % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
