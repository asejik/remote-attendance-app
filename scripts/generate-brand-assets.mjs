// Generates every SiteProof icon and image from one drawing (concept B, "photo
// at a place": a location pin whose head is a camera lens; colour deep teal).
// Dev tool, run by hand after changing the drawing:
//   node scripts/generate-brand-assets.mjs
//   npx @capacitor/assets generate --android --iconBackgroundColor '#0F6B63' --iconBackgroundColorDark '#0F6B63' --splashBackgroundColor '#0F6B63' --splashBackgroundColorDark '#0F6B63'
// Uses Playwright's Chromium to draw the PNGs (the link-preview image loads its
// fonts from Google Fonts, so it needs a connection).
import { writeFileSync, mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const BRAND = '#0F6B63'

// 512 grid. The lens is a real hole (even-odd), so one-colour (Android themed)
// icons show it correctly.
const PIN = 'M256 92c-66 0-120 54-120 120 0 90 120 208 120 208s120-118 120-208c0-66-54-120-120-120z'
const LENS_HOLE = 'M320 212a64 64 0 1 0-128 0a64 64 0 1 0 128 0z'
const glyph = (fill) => `<path d="${PIN} ${LENS_HOLE}" fill="${fill}" fill-rule="evenodd"/><circle cx="256" cy="212" r="27" fill="${fill}"/>`

// The pin spans y 92-420 (328 high) around x 256; centre it at (256, 256) and scale.
const placed = (scale, fill = '#fff') =>
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${glyph(fill)}</g>`

const svg = (body, { size = 512, view = '0 0 512 512' } = {}) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="${size}" height="${size}">${body}</svg>`

// Rounded tile: app icon on the web, legacy Android launchers, PWA.
const tile = svg(`<rect width="512" height="512" rx="96" fill="${BRAND}"/>${placed(1)}`)
// Full-bleed square: the platform crops it (maskable PWA icon, iOS home screen).
const square = (scale) => svg(`<rect width="512" height="512" fill="${BRAND}"/>${placed(scale)}`)
// Android adaptive icon layers (the launcher adds the shape and a 16.7% inset).
const foreground = svg(placed(1.0))
const background = svg(`<rect width="512" height="512" fill="${BRAND}"/>`)
const splash = svg(`<rect width="512" height="512" fill="${BRAND}"/>${placed(0.42)}`)

const ogImage = `<!doctype html><html><head>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@800&family=IBM+Plex+Sans:wght@400&display=block">
<style>
  html, body { margin: 0; }
  .card { width: 1200px; height: 630px; background: ${BRAND}; position: relative; overflow: hidden; display: flex; align-items: center; gap: 48px; padding: 0 88px; box-sizing: border-box; color: #fff; }
  .card::after { content: ""; position: absolute; right: -180px; bottom: -260px; width: 620px; height: 620px; border-radius: 50%; background: rgba(255,255,255,.05); }
  .mark { width: 260px; height: 260px; flex: none; }
  h1 { font: 800 132px/1 Archivo, Arial, sans-serif; letter-spacing: -2px; margin: 0; }
  p { font: 400 40px/1.3 "IBM Plex Sans", Arial, sans-serif; margin: 22px 0 0; opacity: .9; }
</style></head><body>
<div class="card">
  <svg class="mark" viewBox="0 0 512 512">${placed(1.2)}</svg>
  <div><h1>SiteProof</h1><p>Proof-of-presence attendance.<br>Photo and location, even offline.</p></div>
</div></body></html>`

// A .ico file holding one PNG image (supported by every current browser).
const ico = (png, size) => {
  const header = Buffer.alloc(22)
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4)
  header.writeUInt8(size, 6); header.writeUInt8(size, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9)
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18)
  return Buffer.concat([header, png])
}

const browser = await chromium.launch()
const page = await browser.newPage()
const render = async (markup, size, out, transparent = true) => {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${markup.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`)
  const png = await page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } })
  if (out) writeFileSync(out, png)
  return png
}

mkdirSync('assets', { recursive: true })
writeFileSync('public/icon.svg', tile.replace(/ width="512" height="512"/, '') + '\n')
await render(tile, 1024, 'assets/icon-only.png')
await render(foreground, 1024, 'assets/icon-foreground.png')
await render(background, 1024, 'assets/icon-background.png', false)
await render(splash, 2732, 'assets/splash.png', false)
await render(splash, 2732, 'assets/splash-dark.png', false)

await render(tile, 64, 'public/pwa-64x64.png')
await render(tile, 192, 'public/pwa-192x192.png')
await render(tile, 512, 'public/pwa-512x512.png')
await render(square(0.62), 512, 'public/maskable-icon-512x512.png', false)
await render(square(0.72), 180, 'public/apple-touch-icon-180x180.png', false)
writeFileSync('public/favicon.ico', ico(await render(tile, 48), 48))

await page.setViewportSize({ width: 1200, height: 630 })
await page.setContent(ogImage, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
writeFileSync('public/og-image.png', await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }))

await browser.close()
console.log('Brand assets written: public/ (icon.svg, favicon.ico, pwa-*, maskable, apple-touch, og-image) and assets/ (Android sources)')
