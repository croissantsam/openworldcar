/**
 * Helper to push an oriented 3D cuboid into vertex/normal/index arrays.
 */
export function addOrientedBox(
  posList: number[],
  normList: number[],
  idxList: number[],
  cx: number,
  cz: number,
  yMin: number,
  yMax: number,
  halfLen: number,
  halfWidth: number,
  ux: number,
  uz: number,
  nx: number,
  nz: number,
) {
  const baseIdx = posList.length / 3

  const c0x = cx - ux * halfLen - nx * halfWidth
  const c0z = cz - uz * halfLen - nz * halfWidth

  const c1x = cx + ux * halfLen - nx * halfWidth
  const c1z = cz + uz * halfLen - nz * halfWidth

  const c2x = cx + ux * halfLen + nx * halfWidth
  const c2z = cz + uz * halfLen + nz * halfWidth

  const c3x = cx - ux * halfLen + nx * halfWidth
  const c3z = cz - uz * halfLen + nz * halfWidth

  // Face 0: Top (+Y)
  posList.push(c0x, yMax, c0z,  c1x, yMax, c1z,  c2x, yMax, c2z,  c3x, yMax, c3z)
  normList.push(0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0)
  idxList.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3)

  // Face 1: Bottom (-Y)
  const b1 = baseIdx + 4
  posList.push(c3x, yMin, c3z,  c2x, yMin, c2z,  c1x, yMin, c1z,  c0x, yMin, c0z)
  normList.push(0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0)
  idxList.push(b1, b1 + 1, b1 + 2, b1, b1 + 2, b1 + 3)

  // Face 2: Side +N
  const b2 = baseIdx + 8
  posList.push(c2x, yMin, c2z,  c3x, yMin, c3z,  c3x, yMax, c3z,  c2x, yMax, c2z)
  normList.push(nx, 0, nz,  nx, 0, nz,  nx, 0, nz,  nx, 0, nz)
  idxList.push(b2, b2 + 1, b2 + 2, b2, b2 + 2, b2 + 3)

  // Face 3: Side -N
  const b3 = baseIdx + 12
  posList.push(c0x, yMin, c0z,  c1x, yMin, c1z,  c1x, yMax, c1z,  c0x, yMax, c0z)
  normList.push(-nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz,  -nx, 0, -nz)
  idxList.push(b3, b3 + 1, b3 + 2, b3, b3 + 2, b3 + 3)

  // Face 4: End +U
  const b4 = baseIdx + 16
  posList.push(c1x, yMin, c1z,  c2x, yMin, c2z,  c2x, yMax, c2z,  c1x, yMax, c1z)
  normList.push(ux, 0, uz,  ux, 0, uz,  ux, 0, uz,  ux, 0, uz)
  idxList.push(b4, b4 + 1, b4 + 2, b4, b4 + 2, b4 + 3)

  // Face 5: End -U
  const b5 = baseIdx + 20
  posList.push(c3x, yMin, c3z,  c0x, yMin, c0z,  c0x, yMax, c0z,  c3x, yMax, c3z)
  normList.push(-ux, 0, -uz,  -ux, 0, -uz,  -ux, 0, -uz,  -ux, 0, -uz)
  idxList.push(b5, b5 + 1, b5 + 2, b5, b5 + 2, b5 + 3)
}