// check-services.mjs — CI gate for the service registry + spend cap.
//
// The business layer gets the same discipline as the strategy library: a paid (or
// planned-paid) service without pricing, a rationale, and an adoption trigger fails
// CI; projected monthly spend over the solo-dev cap fails CI. Money drift is a
// build break, not a surprise on a statement.

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateServices, projectedMonthlySpend, costPerVideo } from '../lib/business.mjs'

const path = fileURLToPath(new URL('../business/services.json', import.meta.url))
const registry = JSON.parse(fs.readFileSync(path, 'utf8'))
const { valid, errors } = validateServices(registry)

if (!valid) {
  console.error(`check-services: FAIL — ${errors.length} problem(s):`)
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}

const spend = projectedMonthlySpend(registry)
const perVideo = costPerVideo(registry)
const byStatus = {}
for (const s of registry.services) byStatus[s.status] = (byStatus[s.status] || 0) + 1
console.log(`check-services OK — ${registry.services.length} services, all priced + rationaled`)
console.log(`  by status: ${JSON.stringify(byStatus)}`)
console.log(`  projected spend: $${spend.totalUsd}/mo (cap $${registry.monthlySpendCapUsd}) · cost/video: $${perVideo.totalUsd}`)
