// Renders the old code-drawn build/icon.svg to build/icon.png (1024) and build/icon-256.png with Electron's Chromium.
// Since 2026-11-14 the app icon is IV-family art (build/icon.png, icon-256.png, icon.ico; masters and recipe in
// D:\IV-Art\app-icons-20261114), so this only runs with --from-svg, to avoid overwriting it by accident.
// Usage: npx electron scripts/render-icon.cjs --from-svg
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

if (!process.argv.includes('--from-svg')) {
  console.log('The app icon is art now; pass --from-svg to replace it with the old SVG icon.')
  process.exit(0)
}

app.whenReady().then(async () => {
  const svg = readFileSync(join(__dirname, '..', 'build', 'icon.svg'), 'utf8')
  for (const size of [1024, 256]) {
    const win = new BrowserWindow({ width: size, height: size, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
    const html = `<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    await new Promise((r) => setTimeout(r, 300))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
    writeFileSync(join(__dirname, '..', 'build', size === 1024 ? 'icon.png' : 'icon-256.png'), img.resize({ width: size, height: size }).toPNG())
    win.destroy()
  }
  app.quit()
})
