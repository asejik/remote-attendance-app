import { createHmac } from 'node:crypto'

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s), as authenticator apps compute it.
// Used by tests to pass admin two-step login.
const base32 = (input: string) => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of input.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

export const totp = (secret: string, at = Date.now()) => {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const mac = createHmac('sha1', base32(secret)).update(counter).digest()
  const offset = mac[mac.length - 1] & 0xf
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, '0')
}
