import { describe, expect, it } from 'vitest'
import { importKey, randomToken, seal, unseal } from './crypto'
import { parseInvite, encodeInvite } from '../../../shared/team'
import { validMessage } from '../../../main/signal'

describe('sealing', () => {
  it('round-trips, makes invite-sized tokens, and stays inside what main relays', async () => {
    const keyText = randomToken(32)
    expect(keyText).toHaveLength(43)
    expect(parseInvite(encodeInvite(randomToken(16), keyText))).not.toBeNull()
    const key = await importKey(keyText)
    const sealed = await seal(key, { t: 'join', from: 'g1', name: 'Bob' })
    expect(validMessage(sealed)).toBe(true)
    expect(await unseal(key, sealed)).toEqual({ t: 'join', from: 'g1', name: 'Bob' })
  })

  it('refuses another room’s key and tampered text', async () => {
    const key = await importKey(randomToken(32))
    const other = await importKey(randomToken(32))
    const sealed = await seal(key, { t: 'x' })
    expect(await unseal(other, sealed)).toBeNull()
    const [iv, ct] = sealed.split('.')
    const flipped = ct.slice(0, -2) + (ct.at(-2) === 'A' ? 'B' : 'A') + ct.at(-1)
    expect(await unseal(key, `${iv}.${flipped}`)).toBeNull()
    expect(await unseal(key, 'garbage')).toBeNull()
  })
})
