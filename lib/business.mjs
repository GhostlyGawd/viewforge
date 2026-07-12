// business.mjs — the P&L layer: run the factory like a business (operator mandate,
// 2026-07-12). Money decisions get the same discipline as strategy claims:
//
//  - Every external service — free, open, or paid — lives in business/services.json
//    with license, pricing, a decision record, and (for anything paid) an
//    ADOPTION TRIGGER: the measurable condition under which we start paying.
//    Spend without a rationale fails CI exactly like an unsourced strategy.
//  - The SOLO-DEV CAP is code, not vibes: projected monthly spend of in-use
//    services may never exceed `monthlySpendCapUsd`. Raising the cap is a commit.
//  - Unit economics are computed, not asserted: cost/video, monthly P&L,
//    break-even views — with revenue assumptions clearly labeled hypotheses until
//    real analytics exist.
//
// Zero dependencies. tools/check-services.mjs runs validateServices in CI.

export const SERVICE_TIERS = Object.freeze(['free', 'open-source', 'paid', 'paid-planned'])
export const SERVICE_STATUS = Object.freeze(['in-use', 'evaluating', 'planned', 'rejected', 'retired'])
const PAID_TIERS = new Set(['paid', 'paid-planned'])

/**
 * Validate the service registry. Rules:
 *  - unique ids; known tier/status; every service carries a decision.rationale
 *    (no unexplained dependencies, free OR paid);
 *  - paid tiers additionally require pricing AND an adoptionTrigger (planned) or
 *    currentMonthlyUsd/perVideoUsd (in-use) — you cannot pay for something without
 *    saying when/why;
 *  - THE CAP: projected monthly spend of in-use services ≤ monthlySpendCapUsd.
 * Returns { valid, errors }.
 */
export function validateServices(registry) {
  const errors = []
  if (!registry || typeof registry !== 'object') return { valid: false, errors: ['registry is not an object'] }
  if (!(registry.monthlySpendCapUsd > 0)) errors.push('monthlySpendCapUsd (> 0) required — the solo-dev guard is not optional')
  if (!Array.isArray(registry.services) || registry.services.length === 0) errors.push('services[] required')

  const ids = new Set()
  for (const s of registry.services ?? []) {
    const tag = s?.id ?? '(no id)'
    if (!s?.id) errors.push('service missing id')
    if (ids.has(s?.id)) errors.push(`${tag}: duplicate id`)
    ids.add(s?.id)
    if (!SERVICE_TIERS.includes(s?.tier)) errors.push(`${tag}: tier must be ${SERVICE_TIERS.join('|')}`)
    if (!SERVICE_STATUS.includes(s?.status)) errors.push(`${tag}: status must be ${SERVICE_STATUS.join('|')}`)
    if (!s?.decision?.rationale || !String(s.decision.rationale).trim()) errors.push(`${tag}: decision.rationale required — no unexplained dependencies`)
    if (!s?.decision?.date) errors.push(`${tag}: decision.date required (traceability)`)
    if (PAID_TIERS.has(s?.tier)) {
      if (!s?.pricing || typeof s.pricing !== 'object') errors.push(`${tag}: paid service requires pricing`)
      if (s?.status === 'planned' && !(s?.adoptionTrigger && String(s.adoptionTrigger).trim())) {
        errors.push(`${tag}: planned paid service requires an adoptionTrigger — the measurable condition under which we start paying`)
      }
      if (s?.status === 'in-use' && !(typeof s?.pricing?.currentMonthlyUsd === 'number' || typeof s?.pricing?.perVideoUsd === 'number')) {
        errors.push(`${tag}: in-use paid service must state currentMonthlyUsd and/or perVideoUsd`)
      }
    }
  }

  const cadence = registry.assumptions?.videosPerMonth ?? 0
  const spend = projectedMonthlySpend(registry, { videosPerMonth: cadence })
  if (registry.monthlySpendCapUsd > 0 && spend.totalUsd > registry.monthlySpendCapUsd) {
    errors.push(`projected monthly spend $${spend.totalUsd} exceeds the cap $${registry.monthlySpendCapUsd} — either retire a service or raise the cap deliberately (a commit, not a drift)`)
  }
  return { valid: errors.length === 0, errors }
}

/** Projected monthly spend across IN-USE services: fixed monthly + per-video × cadence. */
export function projectedMonthlySpend(registry, { videosPerMonth = registry?.assumptions?.videosPerMonth ?? 0 } = {}) {
  const itemized = []
  for (const s of registry?.services ?? []) {
    if (s.status !== 'in-use') continue
    const fixed = s.pricing?.currentMonthlyUsd ?? 0
    const variable = (s.pricing?.perVideoUsd ?? 0) * videosPerMonth
    const usd = round2(fixed + variable)
    if (usd > 0 || PAID_TIERS.has(s.tier)) itemized.push({ id: s.id, usd })
  }
  return { itemized, totalUsd: round2(itemized.reduce((a, i) => a + i.usd, 0)) }
}

/** Itemized cost of ONE video across in-use services (per-video costs only). */
export function costPerVideo(registry) {
  const itemized = (registry?.services ?? [])
    .filter((s) => s.status === 'in-use' && (s.pricing?.perVideoUsd ?? 0) > 0)
    .map((s) => ({ id: s.id, usd: round2(s.pricing.perVideoUsd) }))
  return { itemized, totalUsd: round2(itemized.reduce((a, i) => a + i.usd, 0)) }
}

/**
 * Monthly P&L from the registry + a revenue model. Revenue inputs are HYPOTHESES
 * until real analytics exist — callers must pass them explicitly; nothing here
 * invents an RPM. Returns revenue, COGS (per-video × cadence), fixed, net, margin.
 */
export function monthlyPnL(registry, { videosPerMonth, viewsPerVideo, rpmUsd, otherMonthlyRevenueUsd = 0 } = {}) {
  for (const [k, v] of [['videosPerMonth', videosPerMonth], ['viewsPerVideo', viewsPerVideo], ['rpmUsd', rpmUsd]]) {
    if (!(typeof v === 'number' && v >= 0)) throw new Error(`monthlyPnL: ${k} (number ≥ 0) required — revenue assumptions are explicit, never defaulted`)
  }
  const revenueUsd = round2((videosPerMonth * viewsPerVideo * rpmUsd) / 1000 + otherMonthlyRevenueUsd)
  const cogsUsd = round2(costPerVideo(registry).totalUsd * videosPerMonth)
  const fixedUsd = round2(
    (registry?.services ?? []).filter((s) => s.status === 'in-use').reduce((a, s) => a + (s.pricing?.currentMonthlyUsd ?? 0), 0),
  )
  const netUsd = round2(revenueUsd - cogsUsd - fixedUsd)
  return {
    revenueUsd,
    cogsUsd,
    fixedUsd,
    grossUsd: round2(revenueUsd - cogsUsd),
    netUsd,
    marginPct: revenueUsd > 0 ? round2((netUsd / revenueUsd) * 100) : null,
    assumptions: { videosPerMonth, viewsPerVideo, rpmUsd, note: 'hypotheses until real analytics exist' },
  }
}

/** Views per video needed to break even at a given cadence and RPM. */
export function breakEvenViewsPerVideo(registry, { videosPerMonth, rpmUsd } = {}) {
  if (!(videosPerMonth > 0) || !(rpmUsd > 0)) throw new Error('breakEvenViewsPerVideo: videosPerMonth and rpmUsd (> 0) required')
  const monthlyCost = costPerVideo(registry).totalUsd * videosPerMonth + (registry?.services ?? []).filter((s) => s.status === 'in-use').reduce((a, s) => a + (s.pricing?.currentMonthlyUsd ?? 0), 0)
  return Math.ceil(((monthlyCost / videosPerMonth) * 1000) / rpmUsd)
}

/**
 * The buy gate: may a planned paid service be adopted? Requires (1) its
 * adoptionTrigger to be declared met WITH evidence (a ledger/analytics citation —
 * "trust me" is not evidence), and (2) cap room after adoption. Pure decision
 * function; flipping status to in-use stays a human commit.
 */
export function canAdoptPaidService(registry, serviceId, { triggerEvidence, videosPerMonth = registry?.assumptions?.videosPerMonth ?? 0 } = {}) {
  const s = (registry?.services ?? []).find((x) => x.id === serviceId)
  if (!s) return { adopt: false, reasons: [`unknown service "${serviceId}"`] }
  const reasons = []
  if (!PAID_TIERS.has(s.tier)) reasons.push(`${serviceId} is not a paid tier — nothing to adopt`)
  if (!(triggerEvidence && String(triggerEvidence).trim())) {
    reasons.push(`adoption requires evidence the trigger fired (calibration-ledger entries, analytics ids) — the trigger is: "${s.adoptionTrigger ?? '(none declared)'}"`)
  }
  const projected = projectedMonthlySpend(registry, { videosPerMonth }).totalUsd + (s.pricing?.plannedMonthlyUsd ?? s.pricing?.currentMonthlyUsd ?? 0) + (s.pricing?.perVideoUsd ?? 0) * videosPerMonth
  if (projected > (registry?.monthlySpendCapUsd ?? 0)) {
    reasons.push(`adopting ${serviceId} projects $${round2(projected)}/mo, over the $${registry.monthlySpendCapUsd} cap — retire something or raise the cap first`)
  }
  return { adopt: reasons.length === 0, reasons, projectedMonthlyUsd: round2(projected) }
}

const round2 = (x) => Math.round(x * 100) / 100
