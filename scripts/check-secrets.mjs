// Fails if a Supabase secret key could reach the browser bundle.
// Usage: node scripts/check-secrets.mjs [dir ...]   (defaults to src and dist)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : ['src', 'dist']
const SECRET_PATTERNS = [/sb_secret_[A-Za-z0-9_-]+/, /SUPABASE_SECRET_KEY/, /SERVICE_ROLE_KEY/]
const JWT = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : [path]
  })

const findings = []
for (const dir of dirs.filter(existsSync)) {
  for (const file of files(dir)) {
    if (/\.(png|jpe?g|webp|ico|woff2?|bin)$/.test(file) || file.includes('-shard')) continue
    const text = readFileSync(file, 'utf8')
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(text)) findings.push(`${file}: matches ${pattern}`)
    }
    for (const [token] of text.matchAll(JWT)) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
        if (payload.role === 'service_role') findings.push(`${file}: service_role JWT`)
      } catch {
        // Not a decodable JWT; ignore.
      }
    }
  }
}

if (findings.length) {
  console.error('Secret check FAILED:\n' + findings.join('\n'))
  process.exit(1)
}
console.log(`Secret check passed (${dirs.join(', ')})`)
