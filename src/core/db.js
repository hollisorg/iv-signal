// Local SQLite store shared by the desktop app and the MCP server.
// Both processes open the same file; WAL mode plus a busy timeout keeps
// concurrent readers and short writes safe.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export function defaultDataDir() {
  if (process.env.IV_SIGNAL_DATA_DIR) return process.env.IV_SIGNAL_DATA_DIR
  // %APPDATA% on Windows, ~/Library/Application Support on a Mac (where macOS apps keep their data), ~/.config elsewhere
  const base = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support') : process.env.APPDATA || join(homedir(), '.config')
  return join(base, 'IV Signal')
}

// Networks IV Signal writes for. Limits are the networks' published caption limits; "needs" is the media a post must
// carry there. Publishing itself isn't connected yet: posts go out by hand from the calendar.
export const CHANNELS = {
  facebook: { name: 'Facebook', limit: 63206, needs: null, compose: 'https://www.facebook.com/' },
  instagram: { name: 'Instagram', limit: 2200, needs: 'image', compose: 'https://www.instagram.com/' },
  linkedin: { name: 'LinkedIn', limit: 3000, needs: null, compose: 'https://www.linkedin.com/feed/' },
  x: { name: 'X', limit: 280, needs: null, compose: 'https://x.com/compose/post' },
  threads: { name: 'Threads', limit: 500, needs: null, compose: 'https://www.threads.net/' },
  tiktok: { name: 'TikTok', limit: 2200, needs: 'video', compose: 'https://www.tiktok.com/upload' },
  youtube: { name: 'YouTube', limit: 5000, needs: 'video', compose: 'https://studio.youtube.com/' },
  pinterest: { name: 'Pinterest', limit: 500, needs: 'image', compose: 'https://www.pinterest.com/pin-creation-tool/' },
  google: { name: 'Google Business Profile', limit: 1500, needs: null, compose: 'https://business.google.com/' },
}
const CHANNEL_LIST = Object.keys(CHANNELS).map((c) => `'${c}'`).join(',')

export const MIGRATIONS = [
  `
  create table settings (key text primary key, value text not null);

  create table brands (
    id text primary key,
    name text not null,
    profile_json text not null default '{}',
    created_at text not null,
    updated_at text not null
  );

  -- The Brand Brain: what the brand knows about itself, one note at a time.
  create table brain (
    id text primary key,
    brand_id text not null references brands(id) on delete cascade,
    kind text not null check (kind in ('fact','voice','rule','lesson','reference')),
    text text not null,
    source text,
    created_by text not null default 'person',
    created_at text not null
  );
  create index brain_brand on brain(brand_id, kind);

  create table campaigns (
    id text primary key,
    brand_id text not null references brands(id) on delete cascade,
    name text not null,
    goal text,
    starts_on text,
    ends_on text,
    status text not null default 'active' check (status in ('active','paused','archived')),
    created_at text not null,
    updated_at text not null
  );
  create index campaigns_brand on campaigns(brand_id);

  -- One idea, written once; variants carry the words for each network.
  create table posts (
    id text primary key,
    brand_id text not null references brands(id) on delete cascade,
    campaign_id text references campaigns(id) on delete set null,
    title text not null,
    idea text,
    status text not null default 'draft' check (status in ('draft','approved','archived')),
    revision integer not null default 1,
    created_by text not null default 'person',
    created_at text not null,
    updated_at text not null
  );
  create index posts_brand on posts(brand_id, status);

  create table variants (
    id text primary key,
    post_id text not null references posts(id) on delete cascade,
    channel text not null check (channel in (${CHANNEL_LIST})),
    text text not null default '',
    media_json text not null default '[]',
    alt_text text,
    planned_for text,
    status text not null default 'draft' check (status in ('draft','approved','posted','skipped')),
    posted_at text,
    posted_url text,
    created_at text not null,
    updated_at text not null,
    unique (post_id, channel)
  );
  create index variants_planned on variants(planned_for);

  -- A person's approval of one exact revision: the fingerprint covers every variant's words, media and time.
  create table approvals (
    id text primary key,
    post_id text not null references posts(id) on delete cascade,
    revision integer not null,
    fingerprint text not null,
    approved_by text not null,
    approved_at text not null
  );
  create index approvals_post on approvals(post_id);

  create table media (
    id text primary key,
    brand_id text not null references brands(id) on delete cascade,
    file text not null,
    name text not null,
    kind text not null check (kind in ('image','video')),
    mime text,
    bytes integer not null,
    sha256 text not null,
    width integer,
    height integer,
    alt_text text,
    created_at text not null
  );
  create index media_brand on media(brand_id);

  -- The accounts a brand posts to. Publishing connects later; until then this records where posts go by hand.
  create table channels (
    id text primary key,
    brand_id text not null references brands(id) on delete cascade,
    channel text not null check (channel in (${CHANNEL_LIST})),
    handle text,
    url text,
    status text not null default 'manual' check (status in ('manual','connected','needs_reconnect')),
    created_at text not null,
    updated_at text not null,
    unique (brand_id, channel)
  );

  -- Every change, and who made it: the person, the in-app chat, or an outside agent.
  create table events (
    id integer primary key autoincrement,
    at text not null,
    kind text not null,
    actor text not null default 'person',
    brand_id text,
    summary text,
    data_json text not null default '{}'
  );
  create index events_at on events(at);
  `,
  // 2: how posted versions did, entered by the person or their agent (later read from the networks).
  `
  create table results (
    id text primary key,
    variant_id text not null references variants(id) on delete cascade,
    measured_at text not null,
    reach integer, views integer, likes integer, comments integer, shares integer, saves integer, clicks integer,
    notes text,
    source text not null default 'person',
    created_at text not null
  );
  create index results_variant on results(variant_id, measured_at);
  `,
  // 3: versions handed to a network to publish (Facebook schedules them itself), and what came back.
  `
  create table deliveries (
    id text primary key,
    variant_id text not null references variants(id) on delete cascade,
    provider text not null,
    external_id text,
    scheduled_for text,
    status text not null check (status in ('scheduled','published','failed','cancelled')),
    url text,
    error text,
    fingerprint text,
    created_at text not null,
    updated_at text not null
  );
  create index deliveries_variant on deliveries(variant_id);
  `,
]

export function openDb(file) {
  const path = file || join(defaultDataDir(), 'signal.db')
  if (path !== ':memory:') mkdirSync(join(path, '..'), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec('pragma journal_mode = wal; pragma busy_timeout = 5000; pragma foreign_keys = on;')
  db.exec('create table if not exists schema_version (version integer not null)')
  const row = db.prepare('select version from schema_version').get()
  let version = row ? row.version : 0
  if (!row) db.prepare('insert into schema_version (version) values (0)').run()
  if (version < MIGRATIONS.length) {
    db.exec('pragma foreign_keys = off')
    while (version < MIGRATIONS.length) {
      tx(db, () => {
        db.exec(MIGRATIONS[version])
        version += 1
        db.prepare('update schema_version set version = ?').run(version)
      })
    }
    db.exec('pragma foreign_keys = on')
  }
  return db
}

const transactionDepth = new WeakMap()
export function tx(db, fn) {
  const depth=transactionDepth.get(db)||0,savepoint=`iv_nested_${depth}`
  db.exec(depth?`savepoint ${savepoint}`:'begin immediate')
  transactionDepth.set(db,depth+1)
  try {
    const result = fn()
    if(result&&typeof result.then==='function')throw Error('Database transactions must be synchronous.')
    db.exec(depth?`release ${savepoint}`:'commit')
    return result
  } catch (err) {
    db.exec(depth?`rollback to ${savepoint}; release ${savepoint}`:'rollback')
    throw err
  } finally { if(depth)transactionDepth.set(db,depth);else transactionDepth.delete(db) }
}

export const now = () => new Date().toISOString()
export const newId = () => randomUUID()

// Who is acting: the window passes 'person'; the MCP server says which agent it serves (IV_SIGNAL_ACTOR).
export const actorOf = (actor) => String(actor || process.env.IV_SIGNAL_ACTOR || 'person').slice(0, 40)

export function logEvent(db, kind, { actor, brand_id = null, summary = '', data = {} } = {}) {
  db.prepare('insert into events (at, kind, actor, brand_id, summary, data_json) values (?, ?, ?, ?, ?, ?)')
    .run(now(), kind, actorOf(actor), brand_id, String(summary).slice(0, 300), JSON.stringify(data))
}

export function listEvents(db, { brand_id = null, limit = 50 } = {}) {
  const n = Math.max(1, Math.min(200, Number(limit) || 50))
  const rows = brand_id
    ? db.prepare('select * from events where brand_id = ? or brand_id is null order by id desc limit ?').all(brand_id, n)
    : db.prepare('select * from events order by id desc limit ?').all(n)
  return rows.map(({ data_json, ...r }) => ({ ...r, data: JSON.parse(data_json || '{}') }))
}

export function getSetting(db, key, fallback = null) {
  const row = db.prepare('select value from settings where key = ?').get(key)
  if (!row) return fallback
  try { return JSON.parse(row.value) } catch { return fallback }
}

export function setSetting(db, key, value) {
  db.prepare('insert into settings (key, value) values (?, ?) on conflict(key) do update set value = excluded.value')
    .run(key, JSON.stringify(value))
}

export const clip = (value, n) => String(value ?? '').trim().slice(0, n)
