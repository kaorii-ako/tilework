import os from 'node:os'
import type { IPty, spawn as ptySpawn } from 'node-pty'
import type { DataEvent, ExitEvent, SpawnRequest } from '../shared/ipc'

type SpawnFn = typeof ptySpawn

/** Owns every PTY, keyed by tileId. The spawn function is injected so tests can fake it. */
export class PtyManager {
  private ptys = new Map<string, IPty>()

  constructor(
    private spawnFn: SpawnFn,
    private onData: (e: DataEvent) => void,
    private onExit: (e: ExitEvent) => void
  ) {}

  spawn({ tileId, command, args, cwd, cols, rows }: SpawnRequest): void {
    this.kill(tileId) // respawning a tile replaces its old PTY
    const file = command ?? (process.env.SHELL || '/bin/bash')
    const pty = this.spawnFn(file, command ? (args ?? []) : ['-l'], {
      name: 'xterm-256color',
      cwd: cwd ?? os.homedir(),
      cols,
      rows,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', AGENT_CANVAS_TILE_ID: tileId }
    })
    this.ptys.set(tileId, pty)
    pty.onData((data) => this.onData({ tileId, data }))
    pty.onExit(({ exitCode }) => {
      // Only forget it if it wasn't already replaced by a respawn.
      if (this.ptys.get(tileId) === pty) this.ptys.delete(tileId)
      this.onExit({ tileId, code: exitCode })
    })
  }

  input(tileId: string, data: string): void {
    this.ptys.get(tileId)?.write(data)
  }

  resize(tileId: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.ptys.get(tileId)?.resize(cols, rows)
  }

  kill(tileId: string): void {
    const pty = this.ptys.get(tileId)
    if (!pty) return
    this.ptys.delete(tileId)
    pty.kill()
  }

  killAll(): void {
    // oxlint-disable-next-line unicorn/no-useless-spread -- kill() mutates the map, so iterate a snapshot
    for (const id of [...this.ptys.keys()]) this.kill(id)
  }

  has(tileId: string): boolean {
    return this.ptys.has(tileId)
  }

  get size(): number {
    return this.ptys.size
  }
}
