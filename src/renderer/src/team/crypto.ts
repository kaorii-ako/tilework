/**
 * Sealing for team signaling (KAO-54): AES-256-GCM with the key from the invite code, so the
 * public signaling server only ever relays ciphertext, and a tampered message fails to open.
 */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

/** `n` random bytes as base64url: room ids (16) and keys (32, which is 43 chars). */
export const randomToken = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)))

export async function importKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', unb64url(key), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

/** `<iv>.<ciphertext>`, both base64url. */
export async function seal(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)))
  return `${b64url(iv)}.${b64url(new Uint8Array(ct))}`
}

/** The sealed value, or null if it's malformed, from another room, or tampered with. */
export async function unseal(key: CryptoKey, sealed: string): Promise<unknown> {
  const [iv, ct, ...rest] = sealed.split('.')
  if (!iv || !ct || rest.length) return null
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64url(iv) }, key, unb64url(ct))
    return JSON.parse(new TextDecoder().decode(pt))
  } catch {
    return null
  }
}
