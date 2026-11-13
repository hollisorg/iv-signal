// Builds, checks and publishes the version in package.json to the private repo's releases.
// Signs the Windows build with Azure Artifact Signing when these are set in the environment (never in files):
//   AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (the signing app registration)
//   IV_SIGNAL_SIGN_ENDPOINT, IV_SIGNAL_SIGN_ACCOUNT, IV_SIGNAL_SIGN_PROFILE, IV_SIGNAL_SIGN_PUBLISHER
// Without them it builds unsigned, but only with --unsigned (so a release never goes out unsigned by accident once
// signing is set up). Usage: node scripts/release.mjs [--unsigned] [--dry]   (--dry builds and checks, publishes nothing)
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

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
run('gh', ['release', 'create', tag, setup, `${setup}.blockmap`, join(root, 'dist', 'latest.yml'), '--repo', 'hollisorg/iv-signal', '--title', `IV Signal ${version}`, '--notes-file', existsSync(join(root, 'dist', `notes-${version}.md`)) ? join(root, 'dist', `notes-${version}.md`) : join(root, 'README.md')])
console.log(`Published ${tag}${sign ? ' (signed)' : ' (unsigned)'}.`)
