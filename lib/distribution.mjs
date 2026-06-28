// distribution.mjs — the distribution department's deterministic engine.
//
// Turns a finished video (script + packaging + brand) into a publish package: an
// SEO-aware description with chapters and sources, a deduped tag set, the chapter
// markers (from the beat sheet), an end-screen plan, and the required disclosures
// (synthetic voice). It also validates the package against the platform's load-bearing
// rules so a malformed publish (bad chapters, missing disclosure, over-long tags)
// can't go out.
//
// Zero dependencies.

const TAG_CHAR_LIMIT = 460 // YouTube's ~500-char tag budget, with headroom
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'why', 'how', 'a', 'is', 'it'])

const fmtTime = (sec) => {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Derive tags from the title, niche, and format. Deduped, lowercased, trimmed to the
 * platform char budget. */
export function deriveTags({ title = '', niche = '', format = '', extra = [] } = {}) {
  const fromTitle = title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  const base = [...fromTitle, niche.toLowerCase(), format.toLowerCase(), ...extra.map((e) => String(e).toLowerCase())].filter(Boolean)
  const seen = new Set()
  const tags = []
  let chars = 0
  for (const t of base) {
    const tag = t.trim()
    if (!tag || seen.has(tag)) continue
    if (chars + tag.length + 2 > TAG_CHAR_LIMIT) break
    seen.add(tag)
    tags.push(tag)
    chars += tag.length + 2
  }
  return tags
}

/** Build chapter markers from the script beats. YouTube requires the first chapter at
 * 00:00 and chapters ≥10s apart; we coalesce short beats to satisfy that. */
export function buildChapters(beats = []) {
  const sorted = [...beats].sort((a, b) => a.startSec - b.startSec)
  const chapters = []
  for (const b of sorted) {
    const last = chapters[chapters.length - 1]
    if (last && b.startSec - last.startSec < 10) continue // too close — coalesce
    chapters.push({ startSec: b.startSec, label: prettyBeatLabel(b.id) })
  }
  if (chapters.length && chapters[0].startSec !== 0) chapters[0].startSec = 0
  return chapters
}

function prettyBeatLabel(id) {
  const map = {
    hook: 'The hook', 'show-dont-tell': 'What happened', progression: 'It escalates',
    'reengage-1': 'But there is more', investment: 'The core', 'reengage-2': 'A twist',
    escalation: 'The big one', payoff: 'Why it matters', outro: 'Next time',
  }
  return map[id] || id
}

/**
 * Build the full publish package.
 *   buildPublishPackage({ video:{title}, script:{beats, sourcesGrounded}, niche, format,
 *                         brand, narrationDisclosureRequired })
 */
export function buildPublishPackage({ video = {}, script = {}, niche = '', format = '', brand = {}, narrationDisclosureRequired = false } = {}) {
  const title = video.title || ''
  const chapters = buildChapters(script.beats || [])
  const tags = deriveTags({ title, niche, format })
  const sources = script.sourcesGrounded || []

  const disclosures = []
  if (narrationDisclosureRequired) disclosures.push('This video uses a synthetic (AI) voice for narration.')

  const descParts = []
  const hookBeat = (script.beats || []).find((b) => b.id === 'hook')
  if (hookBeat?.text) descParts.push(hookBeat.text.split(/(?<=[.!?])\s/)[0])
  descParts.push('') // blank line
  if (chapters.length) {
    descParts.push('Chapters:')
    for (const c of chapters) descParts.push(`${fmtTime(c.startSec)} ${c.label}`)
    descParts.push('')
  }
  if (sources.length) {
    descParts.push('Sources:')
    for (const s of sources) descParts.push(`• ${s.claim} — ${s.source}`)
    descParts.push('')
  }
  if (disclosures.length) descParts.push(...disclosures)

  return {
    title,
    description: descParts.join('\n').trim(),
    tags,
    chapters,
    endScreen: { plan: ['subscribe', 'next-video', 'best-for-viewer'], note: 'last 20s; never an abrupt end (protect late retention)' },
    disclosures,
    brandName: brand.name || null,
  }
}

/** Validate a publish package against the load-bearing platform rules. */
export function validatePublishPackage(pkg, { requireDisclosure = false } = {}) {
  const issues = []
  if (!pkg || typeof pkg !== 'object') return { valid: false, issues: ['no package'] }
  if (!pkg.title) issues.push('missing title')
  if (!pkg.description) issues.push('missing description')

  const ch = pkg.chapters || []
  if (ch.length) {
    if (ch[0].startSec !== 0) issues.push('first chapter must be at 00:00')
    for (let i = 1; i < ch.length; i++) if (ch[i].startSec - ch[i - 1].startSec < 10) issues.push(`chapters too close (<10s) near ${fmtTime(ch[i].startSec)}`)
  }

  const tagChars = (pkg.tags || []).join(', ').length
  if (tagChars > TAG_CHAR_LIMIT + 40) issues.push(`tags exceed char budget (${tagChars})`)

  if (requireDisclosure && !(pkg.disclosures || []).some((d) => /synthetic|ai/i.test(d))) {
    issues.push('synthetic-voice disclosure required but missing')
  }
  return { valid: issues.length === 0, issues }
}

export { TAG_CHAR_LIMIT, fmtTime }
