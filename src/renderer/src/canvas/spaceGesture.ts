/**
 * Space+drag pans, but space is also a key people type into terminals. So a plain
 * space press is held back: if a drag starts while it is down, it was a pan and is
 * dropped; otherwise `flush` sends the space to the focused tile, before any other
 * key, so typing order is kept.
 */
export function createSpaceGesture(flush: () => void) {
  let held = false
  let pending = false // space pressed, not yet sent and not yet a pan
  let panning = false

  const release = () => {
    if (pending) flush()
    held = pending = panning = false
  }

  return {
    get held() {
      return held
    },
    /** Returns true when the event must be swallowed. */
    keyDown(isSpace: boolean): boolean {
      if (!isSpace) {
        if (pending) {
          pending = false
          flush()
        }
        return false
      }
      if (!held) {
        held = pending = true
        return true
      }
      if (panning) return true
      // Space held down without a drag: the user wants repeated spaces.
      if (pending) {
        pending = false
        flush()
      }
      return false
    },
    keyUp(isSpace: boolean): boolean {
      if (!isSpace || !held) return false
      release()
      return true
    },
    /** Returns true when this pointerdown starts a space-pan. */
    pointerDown(): boolean {
      if (!held) return false
      pending = false
      panning = true
      return true
    },
    /** Window lost focus mid-press: don't leave space stuck down. */
    reset() {
      held = pending = panning = false
    }
  }
}
