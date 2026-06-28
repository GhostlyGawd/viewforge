// state.mjs — the project/state manager for ViewForge channels.
//
// Each channel ViewForge runs is one project under state/channels/<slug>/, with a
// single canonical channel.json. The brief asks for state managed "efficiently and
// effectively with no mistakes", so this module is built defensively:
//   - every write is schema-VALIDATED before it touches disk (a malformed state can
//     never be persisted),
//   - every write is ATOMIC (temp file + rename) so an interrupted run can't leave a
//     half-written, corrupt channel.json,
//   - every update is IMMUTABLE — we never mutate the loaded object in place; an
//     update produces a new object, which keeps the event log honest and avoids the
//     hidden-side-effect class of bugs,
//   - an append-only `log` records what happened, so the self-improvement loop can
//     audit decisions after the fact.
//
// The clock is injectable (`now`) so tests are deterministic and so this can run
// somewhere a wall clock isn't available. Zero dependencies.

import fs from 'node:fs'
import path from 'node:path'

export const STATE_SCHEMA_VERSION = 1

// A channel moves through these stages; the pipeline reads `stage` to know what
// department to run next. Stages are ordered.
export const CHANNEL_STAGES = Object.freeze([
  'niche', // selecting the niche
  'brand', // brand + identity suite
  'research', // researching the first slate of videos
  'production', // scripting → voice → motion → edit
  'live', // publishing + optimizing
])

const defaultNow = () => new Date().toISOString()
const kebab = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/**
 * Build a fresh, valid channel object (does not write anything). Exported so the
 * skill can construct + inspect before committing to disk.
 */
export function newChannel({ name, slug, niche } = {}, now = defaultNow) {
  if (!name) throw new Error('newChannel: name is required')
  const ts = now()
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    slug: slug ? kebab(slug) : kebab(name),
    name,
    stage: 'niche',
    createdUtc: ts,
    updatedUtc: ts,
    niche: niche ?? null,
    brand: null,
    videos: [],
    experiments: [],
    log: [{ ts, event: 'channel.created', detail: { name } }],
  }
}

/**
 * Validate a channel object. Returns { valid, errors[] } — never throws.
 */
export function validateChannel(c) {
  const errors = []
  if (!c || typeof c !== 'object') return { valid: false, errors: ['channel is not an object'] }
  if (c.schemaVersion !== STATE_SCHEMA_VERSION) errors.push(`schemaVersion must be ${STATE_SCHEMA_VERSION}, got ${c.schemaVersion}`)
  if (!c.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) errors.push(`slug must be kebab-case, got ${c.slug}`)
  if (!c.name) errors.push('name is required')
  if (!CHANNEL_STAGES.includes(c.stage)) errors.push(`stage must be one of ${CHANNEL_STAGES.join('|')}, got ${c.stage}`)
  for (const f of ['videos', 'experiments', 'log']) if (!Array.isArray(c[f])) errors.push(`${f} must be an array`)
  return { valid: errors.length === 0, errors }
}

function channelDir(root, slug) {
  return path.join(root, 'channels', kebab(slug))
}
function channelFile(root, slug) {
  return path.join(channelDir(root, slug), 'channel.json')
}

/** Atomic JSON write: write to a temp sibling, then rename over the target. */
function writeAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8')
  fs.renameSync(tmp, file)
}

/**
 * Create a channel on disk. Throws if it already exists (no silent overwrite) or
 * if the constructed state is invalid. Returns the persisted channel object.
 */
export function createChannel(root, init, now = defaultNow) {
  const channel = newChannel(init, now)
  const file = channelFile(root, channel.slug)
  if (fs.existsSync(file)) throw new Error(`channel already exists: ${channel.slug} (refusing to overwrite)`)
  const { valid, errors } = validateChannel(channel)
  if (!valid) throw new Error(`refusing to write invalid channel: ${errors.join('; ')}`)
  writeAtomic(file, channel)
  return channel
}

/** Load a channel, or throw if missing/corrupt/invalid. */
export function loadChannel(root, slug) {
  const file = channelFile(root, slug)
  let obj
  try {
    obj = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    throw new Error(`cannot load channel ${slug}: ${e.message}`)
  }
  const { valid, errors } = validateChannel(obj)
  if (!valid) throw new Error(`channel ${slug} is invalid on disk: ${errors.join('; ')}`)
  return obj
}

/**
 * Immutably update a channel and persist it. `patch` is shallow-merged over the
 * loaded state (top-level keys); slug/createdUtc/schemaVersion are protected from
 * being changed. `event` (optional {event, detail}) is appended to the log. Returns
 * the new channel object. Validates before writing — an invalid patch throws and
 * leaves the on-disk state untouched.
 */
export function updateChannel(root, slug, patch = {}, event = null, now = defaultNow) {
  const current = loadChannel(root, slug)
  const ts = now()
  const protectedKeys = ['slug', 'createdUtc', 'schemaVersion']
  const safePatch = { ...patch }
  for (const k of protectedKeys) delete safePatch[k]

  const log = event ? [...current.log, { ts, event: event.event, detail: event.detail ?? null }] : current.log
  const next = { ...current, ...safePatch, updatedUtc: ts, log }

  const { valid, errors } = validateChannel(next)
  if (!valid) throw new Error(`refusing to write invalid channel update: ${errors.join('; ')}`)
  writeAtomic(channelFile(root, slug), next)
  return next
}

/** Append an event to a channel's log without otherwise changing it. */
export function appendEvent(root, slug, event, detail = null, now = defaultNow) {
  return updateChannel(root, slug, {}, { event, detail }, now)
}

/** Advance a channel to a later stage (no skipping backward unless `force`). */
export function advanceStage(root, slug, stage, { force = false } = {}, now = defaultNow) {
  if (!CHANNEL_STAGES.includes(stage)) throw new Error(`unknown stage: ${stage}`)
  const current = loadChannel(root, slug)
  const from = CHANNEL_STAGES.indexOf(current.stage)
  const to = CHANNEL_STAGES.indexOf(stage)
  if (to < from && !force) throw new Error(`refusing to move ${slug} backward (${current.stage} → ${stage}); pass force to override`)
  return updateChannel(root, slug, { stage }, { event: 'stage.changed', detail: { from: current.stage, to: stage } }, now)
}

/** List channel slugs that exist under root. Returns [] if the dir is absent. */
export function listChannels(root) {
  const dir = path.join(root, 'channels')
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.'))
      .map((d) => d.name)
      .filter((slug) => fs.existsSync(channelFile(root, slug)))
      .sort()
  } catch {
    return []
  }
}

export { channelDir, channelFile }
