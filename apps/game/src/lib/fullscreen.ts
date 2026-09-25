/**
 * Cross-browser fullscreen helper & subscriber.
 */

type VendorDoc = Document & {
  webkitFullscreenElement?: Element
  webkitExitFullscreen?: () => Promise<void>
}

type VendorEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void>
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as VendorDoc
  return !!(doc.fullscreenElement || doc.webkitFullscreenElement)
}

export async function toggleFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return
  const doc = document as VendorDoc
  const docEl = document.documentElement as VendorEl

  try {
    if (!isFullscreen()) {
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen()
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen()
      }
    } else {
      if (doc.exitFullscreen) {
        await doc.exitFullscreen()
      } else if (doc.webkitExitFullscreen) {
        await doc.webkitExitFullscreen()
      }
    }
  } catch (err) {
    // Browsers block fullscreen if not triggered by user gesture
    console.warn('[fullscreen] Failed to toggle fullscreen:', err)
  }
}

export function subscribeFullscreen(callback: (active: boolean) => void): () => void {
  if (typeof document === 'undefined') return () => {}

  const handler = () => {
    callback(isFullscreen())
  }

  document.addEventListener('fullscreenchange', handler)
  document.addEventListener('webkitfullscreenchange', handler)

  return () => {
    document.removeEventListener('fullscreenchange', handler)
    document.removeEventListener('webkitfullscreenchange', handler)
  }
}
