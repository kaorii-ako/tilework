import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignalHub, lineSplitter, signalBase, validMessage, validTopic } from './signal'

afterEach(() => {
  delete process.env.TILEWORK_SIGNAL_URL
})

/** A fetch whose subscribe stream yields `chunks`, then stays open until aborted. */
function fakeFetch(chunks: string[]) {
  const posts: { url: string; body: unknown }[] = []
  const gets: string[] = []
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posts.push({ url, body: init.body })
      return new Response('{}', { status: 200 })
    }
    gets.push(url)
    const enc = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(enc.encode(ch))
        init?.signal?.addEventListener('abort', () => c.error(new Error('aborted')))
      }
    })
    return new Response(stream, { status: 200 })
  })
  return { fn: fn as unknown as typeof fetch, posts, gets }
}

describe('validation', () => {
  it('only allows tw- topics and sealed-message characters', () => {
    expect(validTopic('tw-abcdefghijklmnop')).toBe(true)
    expect(validTopic('alerts')).toBe(false)
    expect(validTopic('tw-../../x')).toBe(false)
    expect(validMessage('abc.DEF_-123')).toBe(true)
    expect(validMessage('{"plain":"json"}')).toBe(false)
    expect(validMessage('x'.repeat(4001))).toBe(false)
  })

  it('uses ntfy.sh unless TILEWORK_SIGNAL_URL says otherwise', () => {
    expect(signalBase()).toBe('https://ntfy.sh')
    process.env.TILEWORK_SIGNAL_URL = 'http://127.0.0.1:9999/'
    expect(signalBase()).toBe('http://127.0.0.1:9999')
  })
})

describe('lineSplitter', () => {
  it('joins lines split across chunks and skips blanks', () => {
    const out: string[] = []
    const feed = lineSplitter((l) => out.push(l))
    feed('{"a":1}\n{"b"')
    feed(':2}\n\n{"c":3')
    expect(out).toEqual(['{"a":1}', '{"b":2}'])
  })
})

describe('SignalHub', () => {
  it('delivers only valid message events from the stream, and publishes sealed text', async () => {
    const { fn, posts, gets } = fakeFetch([
      '{"event":"open"}\n',
      '{"event":"message","message":"sealed.abc"}\n{"event":"keepalive"}\n',
      '{"event":"message","message":"<script>"}\n'
    ])
    const got: [string, string][] = []
    const hub = new SignalHub((t, m) => got.push([t, m]), fn)
    hub.subscribe('tw-abcdefghijklmnop')
    hub.subscribe('tw-abcdefghijklmnop') // once only
    await vi.waitFor(() => expect(got).toEqual([['tw-abcdefghijklmnop', 'sealed.abc']]))
    expect(gets).toEqual(['https://ntfy.sh/tw-abcdefghijklmnop/json'])
    expect(await hub.publish('tw-abcdefghijklmnop', 'sealed.xyz')).toBe(true)
    expect(await hub.publish('other', 'sealed.xyz')).toBe(false)
    expect(posts).toEqual([{ url: 'https://ntfy.sh/tw-abcdefghijklmnop', body: 'sealed.xyz' }])
    hub.closeAll()
  })

  it('ignores invalid topics', () => {
    const { fn, gets } = fakeFetch([])
    new SignalHub(() => {}, fn).subscribe('nope')
    expect(gets).toEqual([])
  })
})
