// The business layer: money decisions with strategy-library discipline.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateServices, projectedMonthlySpend, costPerVideo, monthlyPnL, breakEvenViewsPerVideo, canAdoptPaidService } from '../lib/business.mjs'
import { forAll, gens } from './helpers/prop.mjs'

const REAL = JSON.parse(fs.readFileSync(new URL('../business/services.json', import.meta.url), 'utf8'))

const mkRegistry = (over = {}) => ({
  monthlySpendCapUsd: 100,
  assumptions: { videosPerMonth: 8 },
  services: [
    { id: 'free-thing', tier: 'free', status: 'in-use', decision: { rationale: 'r', date: '2026-07-12' } },
    { id: 'paid-thing', tier: 'paid', status: 'in-use', pricing: { currentMonthlyUsd: 10, perVideoUsd: 0.5 }, decision: { rationale: 'r', date: '2026-07-12' } },
    { id: 'planned-thing', tier: 'paid-planned', status: 'planned', pricing: { plannedMonthlyUsd: 5, perVideoUsd: 0.3 }, adoptionTrigger: 'dimension X <6/10 across 2 videos', decision: { rationale: 'r', date: '2026-07-12' } },
  ],
  ...over,
})

test('the REAL registry validates and is currently $0/mo (all free/open at present)', () => {
  const v = validateServices(REAL)
  assert.equal(v.valid, true, JSON.stringify(v.errors))
  assert.equal(projectedMonthlySpend(REAL).totalUsd, 0)
  assert.equal(costPerVideo(REAL).totalUsd, 0)
})

test('discipline: paid without pricing/trigger/rationale fails; cap breaches fail; free needs rationale too', () => {
  const noTrigger = mkRegistry()
  delete noTrigger.services[2].adoptionTrigger
  assert.match(validateServices(noTrigger).errors.join(';'), /adoptionTrigger/)
  const noRationale = mkRegistry()
  noRationale.services[0].decision = { date: '2026-07-12' }
  assert.match(validateServices(noRationale).errors.join(';'), /rationale/)
  const overCap = mkRegistry({ monthlySpendCapUsd: 10 }) // paid-thing alone: 10 + 0.5×8 = 14 > 10
  assert.match(validateServices(overCap).errors.join(';'), /exceeds the cap/)
})

test('property: spend/P&L arithmetic — projected spend = fixed + perVideo×cadence; P&L reconciles', () => {
  forAll(
    gens.record({ fixed: gens.int(0, 40), perVid: gens.float(0, 2), cadence: gens.int(1, 12), views: gens.int(0, 50000), rpm: gens.float(1, 12) }),
    ({ fixed, perVid, cadence, views, rpm }) => {
      const r = mkRegistry({ monthlySpendCapUsd: 10000, assumptions: { videosPerMonth: cadence } })
      r.services[1].pricing = { currentMonthlyUsd: fixed, perVideoUsd: perVid }
      const spend = projectedMonthlySpend(r)
      if (Math.abs(spend.totalUsd - (fixed + perVid * cadence)) > 0.02) return false
      const pnl = monthlyPnL(r, { videosPerMonth: cadence, viewsPerVideo: views, rpmUsd: rpm })
      const expectRev = Math.round(((cadence * views * rpm) / 1000) * 100) / 100
      if (Math.abs(pnl.revenueUsd - expectRev) > 0.02) return false
      return Math.abs(pnl.netUsd - (pnl.revenueUsd - pnl.cogsUsd - pnl.fixedUsd)) < 0.02
    },
    { runs: 250 },
  )
})

test('break-even views cover the monthly cost at the given cadence and RPM', () => {
  const r = mkRegistry({ monthlySpendCapUsd: 10000 })
  const be = breakEvenViewsPerVideo(r, { videosPerMonth: 8, rpmUsd: 4 })
  // monthly cost = 10 + 0.5×8 = 14 → per video 1.75 → views = ceil(1750/4) = 438
  assert.equal(be, 438)
  assert.throws(() => monthlyPnL(r, { videosPerMonth: 8 }), /explicit/) // revenue assumptions never defaulted
})

test('the buy gate: no evidence → no adoption; evidence + cap room → adopt; cap crowding → refused', () => {
  const r = mkRegistry()
  const noEvidence = canAdoptPaidService(r, 'planned-thing', {})
  assert.equal(noEvidence.adopt, false)
  assert.match(noEvidence.reasons.join(';'), /evidence/)
  const ok = canAdoptPaidService(r, 'planned-thing', { triggerEvidence: 'calibration ledger: performance-voice 4.5/10 and 5/10 on vids ep01, ep02 after open-voice upgrade' })
  assert.equal(ok.adopt, true, JSON.stringify(ok.reasons))
  const tight = canAdoptPaidService(mkRegistry({ monthlySpendCapUsd: 15 }), 'planned-thing', { triggerEvidence: 'ledger: …' })
  assert.equal(tight.adopt, false) // 14 already projected + 5 + 2.4 > 15
  assert.match(tight.reasons.join(';'), /cap/)
})
