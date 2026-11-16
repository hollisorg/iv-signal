// The Mac updater's parts (src/service/macupdate.js, from IV Studio): the feed, the zip for each chip, the checksum,
// the download, unpacking and checking the bundle (macOS tools stood in), and the script that swaps the bundle, run for
// real with sh. The whole update, on a real Mac copy, is checked by scripts/ci-mac.sh (mac-update-selftest).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { appBundleOf, cannotReplace, checkFile, download, feedUrls, installScript, newer, parseFeed, pickFile, stage } from '../src/service/macupdate.js'

const NAME = 'IV Signal'
const SLUG = 'IV-Signal'
const RELEASES = 'https://github.com/hollisorg/iv-signal-releases/releases'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ivmac-'))
const sha = (buf) => crypto.createHash('sha512').update(buf).digest('base64')

// shaped like electron-builder's latest-mac.yml after the release merges both chips
const FEED = `version: 0.2.0
files:
  - url: ${SLUG}-mac-arm64.zip
    sha512: xax+zOqtIkMn5Vv2ai07W+d20lDeq2m2oB+SsA8032arHoYm1gRVIV5c98K3t7OEoQbLpgmJPMChjqmvpLvrfw==
    size: 112093489
  - url: ${SLUG}-mac-arm64.dmg
    sha512: 1jTVRD+D4UDit+kB2JMomkC1L895n2mz9Tshdr3DG34skUjUNaJwF8uVeZW2rz0eFYoXHFlf3pLdwjdU3DJUWQ==
    size: 116516067
  - url: ${SLUG}-mac-x64.zip
    sha512: Ged5gfHDCaEur8Fdj/tnBZAVqaiVGZ2oilLkq5kEoBUh/QLMLHXLKAYzwQR3D5yZqlLACznSAQGBJl+WLdkQMg==
    size: 118568186
  - url: ${SLUG}-mac-x64.dmg
    sha512: TbkmvZEFcIarUQjwI3+osBCuAGgiqiXs8cjhiZNSZwVQU/UPim6oexPiu3jBVK+6IZ8N1oP+WBSr+nvvdDvl9w==
    size: 122936948
path: ${SLUG}-mac-arm64.zip
sha512: xax+zOqtIkMn5Vv2ai07W+d20lDeq2m2oB+SsA8032arHoYm1gRVIV5c98K3t7OEoQbLpgmJPMChjqmvpLvrfw==
releaseDate: '2026-11-16T15:08:54.196Z'
`

test('mac update: versions compare', () => {
  assert.equal(newer('1.1.0', '1.0.8'), true)
  assert.equal(newer('1.0.10', '1.0.9'), true)
  assert.equal(newer('v1.0.8', '1.0.8'), false)
  assert.equal(newer('1.0.7', '1.0.8'), false)
  assert.equal(newer('1.0.8', '1.0.8-beta'), true)
  assert.equal(newer('1.0.8-beta', '1.0.8'), false)
  assert.equal(newer('nonsense', '1.0.8'), false)
})

test('mac update: the feed, and the zip for each chip', () => {
  const f = parseFeed(FEED)
  assert.equal(f.version, '0.2.0')
  assert.equal(f.files.length, 4)
  assert.equal(pickFile(f.files, 'arm64').url, `${SLUG}-mac-arm64.zip`)
  assert.equal(pickFile(f.files, 'x64').url, `${SLUG}-mac-x64.zip`)
  assert.equal(pickFile(f.files, 'x64').size, 118568186)
  assert.equal(pickFile([{ url: `${SLUG}-mac-x64.zip`, sha512: 'x' }], 'arm64'), null, 'an Apple Silicon copy never takes the Intel zip')
  assert.throws(() => parseFeed('files: []'))
})

test('mac update: where the feed is', () => {
  const g = feedUrls(RELEASES)
  assert.equal(g.feed, `${RELEASES}/latest/download/latest-mac.yml`)
  assert.equal(g.file(`${SLUG}-mac-arm64.zip`, '0.2.0'), `${RELEASES}/download/v0.2.0/${SLUG}-mac-arm64.zip`)
  const t = feedUrls(RELEASES, 'http://127.0.0.1:9/feed/')
  assert.equal(t.feed, 'http://127.0.0.1:9/feed/latest-mac.yml')
  assert.equal(t.file(`${NAME}.zip`), `http://127.0.0.1:9/feed/${encodeURIComponent(NAME)}.zip`)
})

test('mac update: which copies can replace themselves', () => {
  assert.equal(appBundleOf(`/Applications/${NAME}.app/Contents/MacOS/${NAME}`), `/Applications/${NAME}.app`)
  assert.equal(appBundleOf('/usr/local/bin/node'), null)
  const fine = () => {}
  assert.equal(cannotReplace(`/Applications/${NAME}.app`, { name: NAME, access: fine }), null)
  assert.match(cannotReplace(`/private/var/folders/x/AppTranslocation/ABC/d/${NAME}.app`, { name: NAME, access: fine }), new RegExp(`${NAME} into your Applications folder`))
  assert.match(cannotReplace(`/Volumes/${NAME} 0.2.0/${NAME}.app`, { name: NAME, access: fine }), /disk image/)
  assert.match(cannotReplace(`/Applications/${NAME}.app`, { name: NAME, access: () => { throw new Error('EACCES') } }), /can’t change \/Applications/)
  assert.match(cannotReplace(null, { name: NAME }), /app bundle/)
})

test('mac update: the download, then its size and checksum', async () => {
  const dir = tmp()
  const body = crypto.randomBytes(300_000)
  const server = http.createServer((req, res) => {
    if (req.url === '/moved.zip') return res.writeHead(302, { location: `/${SLUG}-mac-arm64.zip` }).end()
    if (req.url !== `/${SLUG}-mac-arm64.zip`) return res.writeHead(404).end()
    res.writeHead(200, { 'content-length': body.length })
    res.end(body)
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const seen = []
    const file = await download(`${base}/moved.zip`, path.join(dir, 'u', 'a.zip'), { onProgress: (p) => seen.push(p) })
    assert.equal(fs.readFileSync(file).length, body.length)
    assert.equal(seen.at(-1), 100)
    assert.equal(fs.existsSync(`${file}.part`), false)
    assert.equal(await checkFile(file, { sha512: sha(body), size: body.length }), true)
    await assert.rejects(checkFile(file, { sha512: sha(Buffer.from('other')), size: body.length }), /checksum/)
    await assert.rejects(checkFile(file, { sha512: sha(body), size: 5 }), /not 5/)
    await assert.rejects(download(`${base}/missing.zip`, path.join(dir, 'b.zip')), /404/)
  } finally {
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// a stand-in for ditto, PlistBuddy, codesign and xattr: "unzips" by writing a bundle with the given version
function fakeTools({ version = '0.2.0', signed = true, apps = 1 } = {}) {
  const calls = []
  const run = async (cmd, args) => {
    calls.push(path.basename(cmd))
    if (cmd.endsWith('ditto')) {
      for (let i = 0; i < apps; i++) {
        const b = path.join(args[3], i ? `Other ${i}.app` : `${NAME}.app`, 'Contents')
        fs.mkdirSync(path.join(b, 'MacOS'), { recursive: true })
        fs.writeFileSync(path.join(b, 'Info.plist'), version)
      }
      return { code: 0 }
    }
    if (cmd.endsWith('PlistBuddy')) return { code: 0, stdout: `${fs.readFileSync(args[2], 'utf8')}\n` }
    if (cmd.endsWith('codesign')) return signed ? { code: 0 } : { code: 1, stderr: 'invalid signature (code or signature have been modified)' }
    return { code: 0 }
  }
  return { run, calls }
}

test('mac update: unpacking checks the version and the signature', async () => {
  const dir = tmp()
  try {
    const t = fakeTools()
    const app = await stage('x.zip', path.join(dir, 's'), { version: '0.2.0', run: t.run })
    assert.equal(path.basename(app), `${NAME}.app`)
    assert.deepEqual(t.calls, ['ditto', 'PlistBuddy', 'codesign', 'xattr'])
    await assert.rejects(stage('x.zip', path.join(dir, 's'), { version: '0.3.0', run: fakeTools().run }), /says it is 0\.2\.0, not 0\.3\.0/)
    await assert.rejects(stage('x.zip', path.join(dir, 's'), { version: '0.2.0', run: fakeTools({ signed: false }).run }), /signature/)
    await assert.rejects(stage('x.zip', path.join(dir, 's'), { version: '0.2.0', run: fakeTools({ apps: 2 }).run }), /one app/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// the swap script, run with sh when there is one (macOS, Linux, Git Bash on Windows)
const sh = spawnSync('sh', ['-c', 'echo yes'], { encoding: 'utf8' }).stdout?.trim() === 'yes'
test(`mac update: the swap script${sh ? '' : ' (written only: no sh here)'}`, () => {
  const dir = tmp().replace(/\\/g, '/')
  const bundle = `${dir}/Applications/${NAME}.app`
  const staged = `${dir}/stage/${NAME}.app`
  for (const [b, v] of [[bundle, 'old'], [staged, 'new']]) {
    fs.mkdirSync(`${b}/Contents`, { recursive: true })
    fs.writeFileSync(`${b}/Contents/v`, v)
  }
  const log = `${dir}/update.log`
  // a pid that has already ended, so it doesn't wait
  const script = installScript({ pid: 999999, bundle, staged, log, relaunch: false, name: NAME })
  assert.match(script, /^#!\/bin\/sh/)
  assert.ok(script.includes(`mv '${bundle}' '${bundle}.iv-old'`))
  assert.ok(installScript({ pid: 1, bundle: "/A/It's.app", staged: '/s', log: '/l' }).includes(`'/A/It'\\''s.app'`), 'quotes are escaped')
  if (!sh) return
  try {
    fs.writeFileSync(`${dir}/install.sh`, script)
    execFileSync('sh', [`${dir}/install.sh`])
    assert.equal(fs.readFileSync(`${bundle}/Contents/v`, 'utf8'), 'new', 'the new copy is in place')
    assert.equal(fs.existsSync(`${bundle}.iv-old`), false, 'the old copy is gone')
    assert.equal(fs.existsSync(staged), false)
    assert.match(fs.readFileSync(log, 'utf8'), /installed/)
    // when the new copy can't be moved in, the old one is put back
    fs.writeFileSync(`${dir}/install2.sh`, installScript({ pid: 999999, bundle, staged: `${dir}/stage2/missing.app`, log, relaunch: false, name: NAME }))
    execFileSync('sh', [`${dir}/install2.sh`])
    assert.equal(fs.readFileSync(`${bundle}/Contents/v`, 'utf8'), 'new', 'the old copy is back')
    assert.match(fs.readFileSync(log, 'utf8'), /putting the old one back/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
