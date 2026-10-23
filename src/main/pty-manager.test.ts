import { describe, expect, it, vi } from 'vitest'
import type { IPty } from 'node-pty'
import { PtyManager } from './pty-manager'

function fakePty() {
  let exit: (e: { exitCode: number }) => void = () => {}
  const pty = {
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(() => exit({ exitCode: 0 })),
    onData: vi.fn(),
    onExit: vi.fn((cb) => (exit = cb))
  }
  return pty as unknown as IPty & { kill: ReturnType<typeof vi.fn> }
}

function setup() {
  const ptys: ReturnType<typeof fakePty>[] = []
  const spawn = vi.fn(() => {
    const p = fakePty()
    ptys.push(p)
    return p
  })
  const onExit = vi.fn()
  const mgr = new PtyManager(spawn as never, vi.fn(), onExit)
  return { mgr, spawn, ptys, onExit }
}

const req = { cols: 80, rows: 24 }

describe('PtyManager', () => {
  it('tracks spawned PTYs and forgets killed ones', () => {
    const { mgr, ptys } = setup()
    mgr.spawn({ tileId: 'a', ...req })
    mgr.spawn({ tileId: 'b', ...req })
    expect(mgr.size).toBe(2)
    mgr.kill('a')
    expect(ptys[0].kill).toHaveBeenCalled()
    expect(mgr.has('a')).toBe(false)
    expect(mgr.has('b')).toBe(true)
  })

  it('sets AGENT_CANVAS_TILE_ID and spawns a login shell by default', () => {
    const { mgr, spawn } = setup()
    mgr.spawn({ tileId: 't1', ...req })
    const [, args, opts] = spawn.mock.calls[0] as unknown as [string, string[], { env: Record<string, string> }]
    expect(args).toEqual(['-l'])
    expect(opts.env.AGENT_CANVAS_TILE_ID).toBe('t1')
  })

  it('respawning a tile replaces the old PTY without dropping the new one', () => {
    const { mgr, ptys } = setup()
    mgr.spawn({ tileId: 'a', ...req })
    mgr.spawn({ tileId: 'a', ...req })
    expect(ptys[0].kill).toHaveBeenCalled()
    expect(mgr.size).toBe(1)
    mgr.input('a', 'x')
    expect(ptys[1].write).toHaveBeenCalledWith('x')
  })

  it('killAll empties the map', () => {
    const { mgr, ptys } = setup()
    mgr.spawn({ tileId: 'a', ...req })
    mgr.spawn({ tileId: 'b', ...req })
    mgr.killAll()
    expect(mgr.size).toBe(0)
    expect(ptys.every((p) => p.kill.mock.calls.length === 1)).toBe(true)
  })
})
