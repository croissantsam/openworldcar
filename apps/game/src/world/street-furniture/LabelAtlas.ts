/**
 * Label atlas — bus stop / station names on a shared texture per chunk.
 */

import * as THREE from 'three'

const LABEL_W = 256
const LABEL_H = 64
const ATLAS_SIZE = 2048
const ATLAS_COLS = ATLAS_SIZE / LABEL_W
const MAX_LABELS = 256

interface LabelStyle { bg: string; fg: string }
const BUS_STYLE: LabelStyle = { bg: '#1f3a93', fg: '#ffffff' }
const SUBWAY_STYLE: LabelStyle = { bg: '#145a32', fg: '#ffffff' }

const _labelCache = new Map<string, HTMLCanvasElement>()

function renderLabel(text: string, style: LabelStyle): HTMLCanvasElement {
  const key = style.bg + '|' + text
  const cached = _labelCache.get(key)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = LABEL_W
  c.height = LABEL_H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = style.bg
  ctx.fillRect(0, 0, LABEL_W, LABEL_H)
  ctx.fillStyle = style.fg
  ctx.font = 'bold 34px system-ui, Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, LABEL_W / 2, LABEL_H / 2 + 1, LABEL_W - 16)
  if (_labelCache.size > 2000) _labelCache.clear()
  _labelCache.set(key, c)
  return c
}

export class LabelAtlas {
  private entries: { text: string; style: LabelStyle }[] = []
  private slots = new Map<string, number>()
  private height = 0

  /** Reserve a slot for the label; returns its index, or null when full / no DOM. */
  add(text: string, style: LabelStyle): number | null {
    if (typeof document === 'undefined') return null
    const key = style.bg + '|' + text
    const hit = this.slots.get(key)
    if (hit !== undefined) return hit
    if (this.entries.length >= MAX_LABELS) return null
    const i = this.entries.length
    this.entries.push({ text, style })
    this.slots.set(key, i)
    return i
  }

  /** Draw the atlas (2048 × smallest power-of-two height that fits) → one material per chunk. */
  build(): THREE.MeshBasicMaterial | null {
    const n = this.entries.length
    if (n === 0) return null
    const rows = Math.ceil(n / ATLAS_COLS)
    let height = LABEL_H
    while (height < rows * LABEL_H) height *= 2
    this.height = height
    const canvas = document.createElement('canvas')
    canvas.width = ATLAS_SIZE
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    for (let i = 0; i < n; i++) {
      const e = this.entries[i]!
      ctx.drawImage(renderLabel(e.text, e.style), (i % ATLAS_COLS) * LABEL_W, Math.floor(i / ATLAS_COLS) * LABEL_H)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  }

  /** [u0, v0, u1, v1] of a slot — valid after build() (flipY texture: v = 1 - y/height). */
  uv(i: number): [number, number, number, number] {
    const px = (i % ATLAS_COLS) * LABEL_W
    const py = Math.floor(i / ATLAS_COLS) * LABEL_H
    const hgt = this.height || LABEL_H
    return [px / ATLAS_SIZE, 1 - (py + LABEL_H) / hgt, (px + LABEL_W) / ATLAS_SIZE, 1 - py / hgt]
  }
}

export { BUS_STYLE, SUBWAY_STYLE }