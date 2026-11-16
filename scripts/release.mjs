// Builds, checks and publishes the version in package.json to the private repo's releases.
// Signs the Windows build with Azure Artifact Signing when these are set in the environment (never in files):
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (the signing app registration)
//   IV_SIGNAL_SIGN_ENDPOINT, IV_SIGNAL_SIGN_ACCOUNT, IV_SIGNAL_SIGN_PROFILE, IV_SIGNAL_SIGN_PUBLISHER
// Without them it builds unsigned, but only with --unsigned (so a release never goes out unsigned by accident once
// signing is set up). Usage: node scripts/release.mjs [--unsigned] [--dry] [--no-mac]   (--dry builds and checks,
// publishes nothing). After pushing the tag it has GitHub's Mac machines build and check the Mac app for both chips
// and adds those files and one merged latest-mac.yml to the same release (--no-mac skips that).
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const tag = `v${version}`
const win = process.platform === 'win32'
const run = (cmd, a, opts = {}) => {
  console.log(`> ${cmd} ${a.join(' ')}`)
  const r = spawnSync(cmd, a, { cwd: root, stdio: 'inherit', shell: win && /\.cmd$/.test(cmd), ...opts })
  if (r.status !== 0) throw new Error(`${cmd} failed`)
}
const out = (cmd, a) => execFileSync(cmd, a, { cwd: root, encoding: 'utf8', shell: win && /\.cmd$/.test(cmd) }).trim()

const sign = ['IV_SIGNAL_SIGN_ENDPOINT', 'IV_SIGNAL_SIGN_ACCOUNT', 'IV_SIGNAL_SIGN_PROFILE', 'IV_SIGNAL_SIGN_PUBLISHER', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'].every((k) => process.env[k])
if (!sign && !args.includes('--unsigned')) throw new Error('Signing values aren\'t set (see docs/CODE-SIGNING.md). Pass --unsigned to release unsigned on purpose.')
if (out('git', ['status', '--porcelain'])) throw new Error('Commit or stash your changes first.')
if (!dry && out('git', ['tag', '--list', tag])) throw new Error(`${tag} already exists. Bump the version in package.json.`)

run('npm.cmd', ['test'])
run('npm.cmd', ['run', 'build'])
const builder = ['electron-builder', '--win', '--x64', '--publish', 'never']
if (sign) builder.push(
  `-c.win.azureSignOptions.endpoint=${process.env.IV_SIGNAL_SIGN_ENDPOINT}`,
  `-c.win.azureSignOptions.codeSigningAccountName=${process.env.IV_SIGNAL_SIGN_ACCOUNT}`,
  `-c.win.azureSignOptions.certificateProfileName=${process.env.IV_SIGNAL_SIGN_PROFILE}`,
  `-c.win.azureSignOptions.publisherName=${process.env.IV_SIGNAL_SIGN_PUBLISHER}`,
)
run('npx.cmd', builder)
const setup = join(root, 'dist', `IV-Signal-Setup-${version}.exe`)
if (!existsSync(setup)) throw new Error(`${setup} wasn't built.`)
if (sign && win) {
  for (const f of [setup, join(root, 'dist', 'win-unpacked', 'IV Signal.exe')]) {
    const status = out('powershell', ['-NoProfile', '-Command', `(Get-AuthenticodeSignature '${f.replace(/'/g, "''")}').Status`])
    if (status !== 'Valid') throw new Error(`${f} signature is ${status}, not Valid.`)
  }
  console.log('Signatures valid.')
}
run(process.execPath, ['scripts/packaged-check.mjs', join(root, 'dist', 'win-unpacked', 'IV Signal.exe')])
if (dry) { console.log(`Dry run: ${setup} built and checked; nothing published.`); process.exit(0) }

run('git', ['tag', tag])
run('git', ['push', 'origin', 'HEAD', tag])
const mac = args.includes('--no-mac') ? [] : macFiles()
run('gh', ['release', 'create', tag, setup, `${setup}.blockmap`, join(root, 'dist', 'latest.yml'), ...mac, '--repo', 'hollisorg/iv-signal-releases', '--latest', '--title', `IV Signal ${version}`, '--notes-file', existsSync(join(root, 'dist', `notes-${version}.md`)) ? join(root, 'dist', `notes-${version}.md`) : join(root, 'README.md')])
if (mac.length) await checkPublicMacFeed()
console.log(`Published ${tag}${sign ? ' (signed)' : ' (unsigned)'}${mac.length ? ' with the Mac files' : ''}.`)

// The Mac build: GitHub's Mac machines build and check both chips from the pushed tag (.github/workflows/mac.yml);
// this downloads that run's files and merges the two latest-mac-<arch>.yml into one latest-mac.yml listing both, so
// each Mac finds the zip for its own chip. Returns the files to add to the release. --no-mac skips it.
function macFiles() {
  const started = Date.now()
  run('gh', ['workflow', 'run', 'mac.yml', '--repo', 'hollisorg/iv-signal', '--ref', tag])
  let id = null
  for (let i = 0; i < 40 && !id; i++) {
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},3000)'])
    const runs = JSON.parse(out('gh', ['run', 'list', '--repo', 'hollisorg/iv-signal', '--workflow', 'mac.yml', '--event', 'workflow_dispatch', '--limit', '10', '--json', 'databaseId,createdAt,headBranch']))
    id = runs.find((r) => r.headBranch === tag && Date.parse(r.createdAt) >= started - 60_000)?.databaseId || null
  }
  if (!id) throw new Error(`The Mac build for ${tag} didn't start. The tag is pushed; run Actions -> Mac on ${tag} by hand, then release with --no-mac and add the Mac files.`)
  console.log(`Mac build: https://github.com/hollisorg/iv-signal/actions/runs/${id}`)
  run('gh', ['run', 'watch', String(id), '--repo', 'hollisorg/iv-signal', '--exit-status', '--interval', '30'])
  const dir = join(root, 'dist', `mac-${version}`)
  rmSync(dir, { recursive: true, force: true })
  run('gh', ['run', 'download', String(id), '--repo', 'hollisorg/iv-signal', '--dir', dir])
  const files = []
  const feeds = {}
  for (const arch of ['arm64', 'x64']) {
    const d = join(dir, `iv-signal-mac-${arch}`, 'dist')
    for (const f of [`IV-Signal-mac-${arch}.dmg`, `IV-Signal-mac-${arch}.dmg.blockmap`, `IV-Signal-mac-${arch}.zip`, `IV-Signal-mac-${arch}.zip.blockmap`]) {
      if (!existsSync(join(d, f))) throw new Error(`The Mac build has no ${f}.`)
      files.push(join(d, f))
    }
    feeds[arch] = yaml.load(readFileSync(join(d, `latest-mac-${arch}.yml`), 'utf8'))
    if (feeds[arch].version !== version) throw new Error(`The ${arch} Mac build says ${feeds[arch].version}, not ${version}.`)
  }
  const merged = { ...feeds.arm64, files: [...feeds.arm64.files, ...feeds.x64.files] }
  // every file the feed lists is the file being published
  for (const f of merged.files) {
    const local = files.find((p) => p.endsWith(f.url))
    if (!local || createHash('sha512').update(readFileSync(local)).digest('base64') !== f.sha512) throw new Error(`${f.url} doesn't match its latest-mac.yml entry.`)
  }
  const feed = join(dir, 'latest-mac.yml')
  writeFileSync(feed, yaml.dump(merged, { lineWidth: -1 }))
  return [...files, feed]
}

// After publishing: the public latest-mac.yml is the merged one, and each zip it lists downloads with its checksum.
async function checkPublicMacFeed() {
  const base = `https://github.com/hollisorg/iv-signal-releases/releases/download/${tag}`
  const feed = yaml.load(await (await fetch(`${base}/latest-mac.yml`)).text())
  if (feed.version !== version || feed.files.length !== 4) throw new Error('The public latest-mac.yml isn\'t the merged feed.')
  for (const f of feed.files.filter((x) => x.url.endsWith('.zip'))) {
    const body = Buffer.from(await (await fetch(`${base}/${f.url}`)).arrayBuffer())
    if (body.length !== f.size || createHash('sha512').update(body).digest('base64') !== f.sha512) throw new Error(`The public ${f.url} doesn't match latest-mac.yml.`)
  }
  console.log('Public Mac files match latest-mac.yml.')
}
