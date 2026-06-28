import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInsertRequest, validateInsertRequest, YT_LIMITS, YT_CATEGORIES, PRIVACY } from '../lib/youtube-upload.mjs'

const pkg = () => ({
  title: 'Why A Misplaced Comma Cost 40 Million Dollars',
  description: 'In 1872, somebody slipped a single comma into American law.\n\nSources: ...',
  tags: ['comma', 'history', 'micro-history'],
  disclosures: ['This video uses a synthetic (AI) voice for narration.'],
})

test('buildInsertRequest defaults to PRIVATE (never auto-public) and Education category', () => {
  const req = buildInsertRequest(pkg())
  assert.equal(req.requestBody.status.privacyStatus, 'private')
  assert.equal(req.requestBody.snippet.categoryId, YT_CATEGORIES.education)
  assert.deepEqual(req.part, ['snippet', 'status'])
})

test('synthetic-voice disclosure is detected from the package and surfaced', () => {
  const req = buildInsertRequest(pkg())
  assert.equal(req.disclosures.syntheticMediaDisclosed, true)
  assert.ok(req.disclosures.note.includes('Studio'))
})

test('scheduling forces private + sets publishAt', () => {
  const req = buildInsertRequest(pkg(), { privacyStatus: 'public', publishAtUtc: '2026-07-01T15:00:00Z' })
  assert.equal(req.requestBody.status.privacyStatus, 'private')
  assert.equal(req.requestBody.status.publishAt, '2026-07-01T15:00:00Z')
})

test('validateInsertRequest passes a good request', () => {
  assert.equal(validateInsertRequest(buildInsertRequest(pkg())).valid, true)
})

test('validateInsertRequest flags an over-long title and bad privacy', () => {
  const req = buildInsertRequest(pkg())
  req.requestBody.snippet.title = 'x'.repeat(YT_LIMITS.titleMax + 1)
  req.requestBody.status.privacyStatus = 'semi-public'
  const r = validateInsertRequest(req)
  assert.equal(r.valid, false)
  assert.ok(r.issues.some((i) => i.includes('title')))
  assert.ok(r.issues.some((i) => i.includes('privacyStatus')))
})

test('validateInsertRequest flags over-budget tags', () => {
  const req = buildInsertRequest({ ...pkg(), tags: [' '.repeat(YT_LIMITS.tagsCharMax + 1)] })
  assert.equal(validateInsertRequest(req).valid, false)
})

test('buildInsertRequest throws without a title', () => {
  assert.throws(() => buildInsertRequest({}))
})

test('PRIVACY enum is the canonical three', () => {
  assert.deepEqual(PRIVACY, ['private', 'unlisted', 'public'])
})
