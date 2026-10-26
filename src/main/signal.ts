/**
 * Team mode signaling (KAO-54): a narrow pipe to a public ntfy server, so two Tilework
 * instances can swap WebRTC connection details without a server of our own. Messages are
 * sealed in the renderer with the room key; main only ever sees ciphertext, and only for
 * `tw-` topics. TILEWORK_SIGNAL_URL points it at another ntfy (self-hosted, or a test stub).
 */

export const signalBase = () => (process.env.TILEWORK_SIGNAL_URL || 'https://ntfy.sh').replace(/\/+$/, '')

const TOPIC = /^tw-[A-Za-z0-9_-]{16,64}$/
/** ntfy turns messages over 4 KB into attachments; sealed signaling messages stay well under. */
const MESSAGE = /^[A-Za-z0-9_.-]{1,4000}$/

export const validTopic = (t: unknown): t is string => typeof t === 'string' && TOPIC.test(t)
export const validMessage = (m: unknown): m is string => typeof m === 'string' && MESSAGE.test(m)

/** Feeds chunks of an NDJSON stream in, hands complete lines out. */
export function lineSplitter(onLine: (line: string) => void): (chunk: string) => void {
  let rest = ''
  return (chunk) => {
    const lines = (rest + chunk).split('\n')
    rest = lines.pop() ?? ''
    for (const l of lines) if (l.trim()) onLine(l)
  }
}

type Fetch = typeof fetch

export class SignalHub {
  private subs = new Map<string, AbortController>()

  constructor(
    private deliver: (topic: string, message: string) => void,
    private fetchFn: Fetch = fetch,
    private retryMs = 2000
  ) {}

  /** Stream a topic's new messages to `deliver` until unsubscribed, reconnecting on drops. */
  subscribe(topic: string): void {
    if (!validTopic(topic) || this.subs.has(topic)) return
    const ctl = new AbortController()
    this.subs.set(topic, ctl)
    void this.listen(topic, ctl.signal)
  }

  unsubscribe(topic: string): void {
    this.subs.get(topic)?.abort()
    this.subs.delete(topic)
  }

  closeAll(): void {
    for (const t of this.subs.keys()) this.unsubscribe(t)
  }

  async publish(topic: string, message: string): Promise<boolean> {
    if (!validTopic(topic) || !validMessage(message)) return false
    try {
      const r = await this.fetchFn(`${signalBase()}/${topic}`, { method: 'POST', body: message })
      return r.ok
    } catch {
      return false
    }
  }

  private async listen(topic: string, signal: AbortSignal): Promise<void> {
    const decoder = new TextDecoder()
    const feed = lineSplitter((line) => {
      try {
        const m = JSON.parse(line)
        if (m?.event === 'message' && validMessage(m.message)) this.deliver(topic, m.message)
      } catch {
        /* not JSON: ignore */
      }
    })
    while (!signal.aborted) {
      try {
        const r = await this.fetchFn(`${signalBase()}/${topic}/json`, { signal })
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`)
        const reader = r.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          feed(decoder.decode(value, { stream: true }))
        }
      } catch {
        /* dropped or refused: retry below unless we were closed */
      }
      if (!signal.aborted) await new Promise((res) => setTimeout(res, this.retryMs))
    }
  }
}
