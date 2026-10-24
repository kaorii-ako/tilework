import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { NEW_TILE, canvasStore, placeNewTile, uniqueTitle, useCanvas, type CanvasState } from './store'
import { createSpaceGesture } from './spaceGesture'
import { perFrame } from './perFrame'
import { TileFrame } from './TileFrame'
import { LinkLayer } from './LinkLayer'
import { Toolbar } from './Toolbar'
import { HookBanner } from './HookBanner'
import { EmptyState, Launcher, type LaunchChoice } from '../Launcher'

const isTerminal = (t: EventTarget | null) => t instanceof HTMLElement && t.classList.contains('xterm-helper-textarea')
/** Form controls keep their own space key (typing, pressing a button). */
const isFormField = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  !isTerminal(t) &&
  (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))
const isBackground = (t: EventTarget | null) => t instanceof Element && !t.closest('.tile')

/**
 * The infinite surface. Panning writes one CSS transform on the world element straight
 * from the store, outside React, so tiles and terminals never re-render or refit.
 */
export function Canvas() {
  const surface = useRef<HTMLDivElement>(null)
  const world = useRef<HTMLDivElement>(null)
  const tileIds = useCanvas(useShallow((s) => s.tiles.map((t) => t.id)))
  const [launcherOpen, setLauncherOpen] = useState(false)
  const launcherWasOpen = useRef(false)

  // Closing the launcher hands keyboard focus back to the focused tile's terminal.
  useEffect(() => {
    if (launcherOpen) launcherWasOpen.current = true
    else if (launcherWasOpen.current) {
      launcherWasOpen.current = false
      const id = canvasStore.getState().focusedTileId
      document.querySelector<HTMLElement>(`.tile[data-tile-id="${id}"] .xterm-helper-textarea`)?.focus()
    }
  }, [launcherOpen])

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
      // Ctrl+Shift+N opens the launcher. Capture phase, so a focused xterm can't eat it.
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyN') {
        e.preventDefault()
        e.stopPropagation()
        setLauncherOpen(true)
        return
      }
      if (e.isComposing || isFormField(e.target)) return
      const linkId = canvasStore.getState().selectedLinkId
      if (linkId && (e.key === 'Delete' || e.key === 'Backspace') && !isTerminal(e.target)) {
        e.preventDefault()
        e.stopPropagation()
        canvasStore.getState().removeLink(linkId)
        return
      }
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

    // Pointer moves and wheel ticks are applied at most once per frame, as one store update.
    let pan: { x: number; y: number } | null = null // pointer position already applied
    const panTo = perFrame((p: { x: number; y: number }) => {
      if (!pan) return
      canvasStore.getState().panBy(p.x - pan.x, p.y - pan.y)
      pan = p
    })
    let wheel = { dx: 0, dy: 0 }
    const wheelPan = perFrame(() => {
      canvasStore.getState().panBy(wheel.dx, wheel.dy)
      wheel = { dx: 0, dy: 0 }
    })
    let zoom = { factor: 1, at: { x: 0, y: 0 } }
    const wheelZoom = perFrame(() => {
      canvasStore.getState().zoomAt(zoom.factor, zoom.at)
      zoom = { factor: 1, at: zoom.at }
    })

    const startPan = (e: PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      el.setPointerCapture(e.pointerId)
      el.classList.add('panning')
      pan = { x: e.clientX, y: e.clientY }
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
        canvasStore.getState().selectLink(null) // a click on a line re-selects it right after (React runs later)
        ;(document.activeElement as HTMLElement | null)?.blur()
      }
    }
    const onPointerMove = (e: PointerEvent) => pan && panTo({ x: e.clientX, y: e.clientY })
    const endPan = () => {
      panTo.flush()
      pan = null
      el.classList.remove('panning')
    }
    // ctrl+wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms around the cursor.
    // Plain scroll pans, except over a live terminal, where it scrolls the terminal.
    const onWheel = (e: WheelEvent) => {
      const k = e.deltaMode === 1 ? 16 : 1
      if (e.ctrlKey) {
        e.preventDefault()
        const r = el.getBoundingClientRect()
        zoom = {
          factor: zoom.factor * Math.exp(-e.deltaY * k * 0.002),
          at: { x: e.clientX - r.left, y: e.clientY - r.top }
        }
        wheelZoom(undefined)
        return
      }
      if (!isBackground(e.target) && canvasStore.getState().viewport.zoom === 1) return
      e.preventDefault()
      wheel = { dx: wheel.dx - e.deltaX * k, dy: wheel.dy - e.deltaY * k }
      wheelPan(undefined)
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
      panTo.cancel()
      wheelPan.cancel()
      wheelZoom.cancel()
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

  const surfaceSize = () => {
    const r = surface.current!.getBoundingClientRect()
    return { w: r.width, h: r.height }
  }

  const launch = ({ preset, cwd, title }: LaunchChoice) => {
    setLauncherOpen(false)
    const s = canvasStore.getState()
    const size = surfaceSize()
    const pos = placeNewTile(s.viewport, size, s.tiles, s.focusedTileId)
    const id = crypto.randomUUID()
    const folder = cwd?.split('/').filter(Boolean).pop()
    s.addTile({
      id,
      title: uniqueTitle(title ?? (folder ? `${preset.name} · ${folder}` : preset.name), s.tiles),
      command: preset.command,
      args: preset.args,
      shell: preset.shell,
      presetId: preset.id,
      cwd,
      ...pos,
      ...NEW_TILE
    })
    s.revealTile(id, size)
  }

  return (
    <div className="app">
      <div className="surface" ref={surface}>
        <div className="world" ref={world}>
          <LinkLayer />
          {tileIds.map((id) => (
            <TileFrame key={id} id={id} />
          ))}
        </div>
        {tileIds.length === 0 && !launcherOpen && <EmptyState onLaunch={launch} />}
      </div>
      {tileIds.length > 0 && (
        <Toolbar
          onNewTile={() => setLauncherOpen(true)}
          onFit={() => canvasStore.getState().zoomToFit(surfaceSize())}
        />
      )}
      <HookBanner />
      {launcherOpen && <Launcher onLaunch={launch} onClose={() => setLauncherOpen(false)} />}
    </div>
  )
}
