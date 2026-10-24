/**
 * Coalesce calls to at most one per animation frame, with the latest argument. Pointer and
 * wheel events can fire several times a frame; the store (and everything subscribed to it)
 * only needs to hear about the last one. `flush` runs a pending call now, `cancel` drops it.
 */
export function perFrame<T>(fn: (v: T) => void): ((v: T) => void) & { flush(): void; cancel(): void } {
  let id = 0
  let last: T
  const run = () => {
    id = 0
    fn(last)
  }
  const call = (v: T) => {
    last = v
    if (!id) id = requestAnimationFrame(run)
  }
  call.flush = () => {
    if (!id) return
    cancelAnimationFrame(id)
    run()
  }
  call.cancel = () => {
    cancelAnimationFrame(id)
    id = 0
  }
  return call
}
