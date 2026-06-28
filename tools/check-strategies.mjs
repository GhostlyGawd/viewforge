// check-strategies.mjs — CI gate for the strategy library.
//
// Loads every strategy through the same registry the engine uses and fails (exit 1)
// if ANY file is malformed, unsourced, has a duplicate id, or otherwise violates the
// schema. This is what guarantees the library can never silently accept slop: a
// strategy without a real source, a bad metric, or a broken lifecycle state stops CI.

import { fileURLToPath } from 'node:url'
import { loadStrategies } from '../lib/strategy-registry.mjs'

const dir = fileURLToPath(new URL('../strategy-library/strategies/', import.meta.url))
const { strategies, problems } = loadStrategies(dir)

if (problems.length) {
  console.error(`check-strategies: FAIL — ${problems.length} problem(s):`)
  for (const p of problems) console.error(`  ${p.file}: ${p.error}`)
  process.exit(1)
}

if (strategies.length === 0) {
  console.error('check-strategies: FAIL — no strategies found')
  process.exit(1)
}

// Light health summary so the library's shape is visible in CI logs.
const byStatus = {}
const byCategory = {}
for (const s of strategies) {
  byStatus[s.status] = (byStatus[s.status] || 0) + 1
  byCategory[s.category] = (byCategory[s.category] || 0) + 1
}
console.log(`check-strategies OK — ${strategies.length} strategies, all sourced + schema-valid`)
console.log(`  by status:   ${JSON.stringify(byStatus)}`)
console.log(`  by category: ${JSON.stringify(byCategory)}`)
