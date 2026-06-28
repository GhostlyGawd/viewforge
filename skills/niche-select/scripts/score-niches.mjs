#!/usr/bin/env node
// score-niches.mjs — CLI front-end for the niche-selection engine.
//
// Usage:
//   node score-niches.mjs candidates.json
//   node score-niches.mjs candidates.json --weights weights.json
//   cat candidates.json | node score-niches.mjs -
//
// `candidates.json` is an array of niche objects:
//   [{ "name": "Deep-space explainers",
//      "factors": { "demand": 8, "growth": 7, "monetization": 6, "saturation": 5,
//                   "differentiability": 7, "productionFit": 9, "repeatability": 8,
//                   "productionCost": 4, "passionDurability": 7 },
//      "notes": "factor sources go here" }, ... ]
//
// Factors are 0..10. Missing factors default to a neutral 5 and are reported so the
// research department knows what still needs grounding. Prints a ranked table + JSON.
// This is just a thin shell over the tested lib/niche-score.mjs — all logic is there.

import fs from 'node:fs'
import { rankNiches, rankingConfidence, NICHE_FACTORS } from '../../../lib/niche-score.mjs'

function readInput(arg) {
  if (arg === '-' || arg === undefined) return fs.readFileSync(0, 'utf8') // stdin
  return fs.readFileSync(arg, 'utf8')
}

const args = process.argv.slice(2)
const wIdx = args.indexOf('--weights')
let weights = {}
if (wIdx !== -1) {
  weights = JSON.parse(fs.readFileSync(args[wIdx + 1], 'utf8'))
  args.splice(wIdx, 2)
}

let candidates
try {
  candidates = JSON.parse(readInput(args[0]))
} catch (e) {
  console.error(`score-niches: could not read/parse candidates: ${e.message}`)
  process.exit(1)
}
if (!Array.isArray(candidates) || candidates.length === 0) {
  console.error('score-niches: expected a non-empty JSON array of niche candidates')
  process.exit(1)
}

const ranked = rankNiches(candidates, weights)

console.log(`\nNiche ranking (${ranked.length} candidates, ${NICHE_FACTORS.length} factors)\n`)
console.log('rank  score  conf   niche')
console.log('----  -----  -----  ' + '-'.repeat(40))
for (const r of ranked) {
  const conf = rankingConfidence(r)
  const flag = r.missing.length ? `  ⚠ ${r.missing.length} factor(s) ungrounded` : ''
  console.log(
    `${String(r.rank).padStart(3)}   ${String(r.score).padStart(5)}  ${conf.toFixed(2)}   ${r.name}${flag}`,
  )
}

const top = ranked[0]
console.log(`\nTop pick: ${top.name} (score ${top.score}, confidence ${rankingConfidence(top).toFixed(2)})`)
if (rankingConfidence(top) < 0.7) {
  console.log('  ⚠ Low grounding — send the research department back to source the missing factors before committing.')
}
console.log('\n--- JSON ---')
console.log(JSON.stringify(ranked, null, 2))
