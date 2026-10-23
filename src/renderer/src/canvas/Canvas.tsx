import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { NEW_TILE, canvasStore, placeNewTile, useCanvas, type CanvasState } from './store'
import { createSpaceGesture } from './spaceGesture'
import { TileFrame } from './TileFrame'

const isTerminal = (t: EventTarget | null) => t instanceof HTMLElement && t.classList.contains('xterm-helper-textarea')
const isTextField = (t: EventTarget | null) =>
  t instanceof HTMLElement && !isTerminal(t) && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
const isBackground = (t: EventTarget | null) => t instanceof Element && !t.closest('.tile')

/**
 * The infinite surface. Panning writes one CSS transform on the world element straight
 * from the store, outside React, so tiles and terminals never re-render or refit.
 */
export function Canvas() {
  const surface = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const pan = useRef<{ x: number; y: number } | null>(null)
  const tileIds = useCanvas(useShallow((s) => s.tiles.map((t) => t.id)))

  useEffect(() => {
    const el = surface.current!
    const apply = ({ viewport: v }: CanvasState) => {
      const x = Math.round(v.x)
      const y = Math.round(v.y)
      world.current!.style.transform = `translate(${x}px, ${y}px) scale(${v.zoom})`
      el.style.backgroundPosition = `${x}px ${y}px`
    }
    apply(canvasStore.getState())
    const unsub = canvasStore.subscribe((s, prev) => s.viewport !== prev.viewport && apply(s))

    const gesture = createSpaceGesture(() => {
      const id = canvasStore.getState().focusedTileId
      if (id && isTerminal(document.activeElement)) window.canvasApi.input({ tileId: id, data: ' ' })
    })
    const plainSpace = (e: KeyboardEvent) => e.code === 'Space' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
    const grab = () => el.classList.toggle('grab', gesture.held)

    // Capture phase on window, so this runs before xterm sees the key.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || isTextField(e.target)) return
      if (gesture.keyDown(plainSpace(e))) {
        e.preventDefault()
        e.stopPropagation()
      }
      grab()
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (gesture.keyUp(e.code === 'Space')) e.stopPropagation()
      grab()
    }
    const onBlur = () => {
      gesture.reset()
      grab()
    }

    const startPan = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      el.setPointerCapture(e.pointerId)
      el.classList.add('panning')
      pan.current = { x: e.clientX, y: e.clientY }
    }
    // Space+drag pans from anywhere, even over a tile. Window capture runs before
    // React's own capture handlers on #root, so the tile under the cursor isn't focused.
    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button === 0 && gesture.pointerDown()) startPan(e)
    }
    // Middle-drag pans from the background only; on a tile it stays a Linux paste.
    const onPointerDown = (e: PointerEvent) => {
      if (!isBackground(e.target)) return
      if (e.button === 1) startPan(e)
      else if (e.button === 0) {
        canvasStore.getState().focusTile(null)
        ;(document.activeElement as HTMLElement | null)?.blur()
      }
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!pan.current) return
      canvasStore.getState().panBy(e.clientX - pan.current.x, e.clientY - pan.current.y)
      pan.current = { x: e.clientX, y: e.clientY }
    }
    const endPan = () => {
      pan.current = null
      el.classList.remove('panning')
    }
    // ctrl+wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms around the cursor.
    // Plain scroll pans, except over a live terminal, where it scrolls the terminal.
    const onWheel = (e: WheelEvent) => {
      const k = e.deltaMode === 1 ? 16 : 1
      const s = canvasStore.getState()
      if (e.ctrlKey) {
        e.preventDefault()
        const r = el.getBoundingClientRect()
        s.zoomAt(Math.exp(-e.deltaY * k * 0.002), { x: e.clientX - r.left, y: e.clientY - r.top })
        return
      }
      if (!isBackground(e.target) && s.viewport.zoom === 1) return
      e.preventDefault()
      s.panBy(-e.deltaX * k, -e.deltaY * k)
    }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerdown', onPointerDownCapture, true)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endPan)
    el.addEventListener('pointercancel', endPan)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      unsub()
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerdown', onPointerDownCapture, true)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPan)
      el.removeEventListener('pointercancel', endPan)
      el.removeEventListener('wheel', onWheel)
    }
  }, [])

  // ponytail: temporary; KAO-25's launcher replaces this button.
  const newShell = () => {
    const s = canvasStore.getState()
    const r = surface.current!.getBoundingClientRect()
    const pos = placeNewTile(s.viewport, { w: r.width, h: r.height }, s.tiles)
    s.addTile({ id: crypto.randomUUID(), title: 'shell', ...pos, ...NEW_TILE })
  }

  return (
    <div className="app">
      <div className="surface" ref={surface}>
        <div className="world" ref={world}>
          {tileIds.map((id) => (
            <TileFrame key={id} id={id} />
          ))}
        </div>
      </div>
      <div className="toolbar">
        <button type="button" onClick={newShell} title="New shell tile">
          + Shell
        </button>
      </div>
    </div>
  )
}
