import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildManifest, validateManifest, filterUsable, dedupeAssets, bindAssetsToPlan, validatePlanAssets, MIN_LONG_EDGE } from '../lib/asset-source.mjs'
import { isUsable } from '../lib/asset-license.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

const LICENSES = ['public domain', 'cc0', 'CC BY 4.0', 'CC BY-SA 3.0', 'CC BY-NC 4.0', 'CC BY-ND', 'all rights reserved', 'totally made up', '']

// Generator for a raw asset: small id pool + sometimes-missing fields → exercises the
// gate, the resolution floor, dedup, and provenance all at once.
const genAsset = gens.record({
  id: (rng) => 'a' + gens.int(1, 6)(rng),
  url: (rng) => 'https://img/' + gens.int(1, 6)(rng) + '.jpg',
  source: (rng) => gens.pick(['openverse', 'loc', ''])(rng),
  sourceUrl: (rng) => gens.pick(['https://src/x', ''])(rng),
  license: gens.pick(LICENSES),
  attribution: (rng) => gens.pick(['Jane / LoC', null, ''])(rng),
  width: gens.int(200, 3000),
  height: gens.int(200, 3000),
})

// ---- A2: property — buildManifest output is always clean ----

test('A2 property: every asset in a built manifest is usable-licensed, meets resolution, deduped', () => {
  forAll(gens.array(genAsset, 0, 25), (assets) => {
    const m = buildManifest(assets)
    const ids = new Set()
    const urls = new Set()
    for (const a of m.assets) {
      if (!isUsable(a.license, { attribution: a.attribution })) return false
      if (Math.max(a.width, a.height) < MIN_LONG_EDGE) return false
      if (ids.has(a.id) || urls.has(a.url)) return false
      ids.add(a.id)
      urls.add(a.url)
    }
    return true
  }, { runs: 300 })
})

// ---- A4: property — the manifest is always auditable (validateManifest passes) ----

test('A4 property: validateManifest always passes for buildManifest output', () => {
  forAll(gens.array(genAsset, 0, 25), (assets) => validateManifest(buildManifest(assets)).valid === true, { runs: 300 })
})

test('A2/A4 property: nothing usable is wrongly dropped (kept + dropped partitions the input)', () => {
  forAll(gens.array(genAsset, 0, 20), (assets) => {
    const { kept, dropped } = filterUsable(assets)
    return kept.length + dropped.length === assets.length
  })
})

// ---- A2: BDD ----

feature('Archival image manifest', () => {
  scenario('A mixed batch keeps only the rights-clean, high-res, attributed images', () => {
    const batch = given('a batch with PD, CC-BY (attributed), CC-BY-NC, a low-res PD, and a dupe', () => [
      { id: 'pd1', url: 'u/pd1', source: 'loc', sourceUrl: 's/pd1', license: 'no known restrictions', width: 2000, height: 1500 },
      { id: 'by1', url: 'u/by1', source: 'openverse', sourceUrl: 's/by1', license: 'CC BY 4.0', attribution: 'Jane', width: 1600, height: 1200 },
      { id: 'nc1', url: 'u/nc1', source: 'openverse', sourceUrl: 's/nc1', license: 'CC BY-NC 4.0', attribution: 'Bob', width: 1600, height: 1200 },
      { id: 'small', url: 'u/small', source: 'loc', sourceUrl: 's/small', license: 'public domain', width: 640, height: 480 },
      { id: 'pd1', url: 'u/pd1', source: 'loc', sourceUrl: 's/pd1', license: 'public domain', width: 2000, height: 1500 },
    ])
    const m = when('the manifest is built', () => buildManifest(batch))
    then('only pd1 and by1 survive', () => {
      assert.deepEqual(m.assets.map((a) => a.id).sort(), ['by1', 'pd1'])
    })
    and('the manifest validates', () => assert.equal(validateManifest(m).valid, true))
  })

  scenario('CC-BY without attribution is dropped with a clear reason', () => {
    const m = when('a CC-BY image without attribution is in the batch', () =>
      buildManifest([{ id: 'x', url: 'u/x', source: 'openverse', sourceUrl: 's/x', license: 'CC BY 4.0', width: 2000, height: 1500 }]),
    )
    then('it is dropped for missing attribution', () => {
      assert.equal(m.assets.length, 0)
      assert.match(m.dropped[0].reason, /attribution/)
    })
  })
})

// ---- A3: BDD — plan ↔ manifest binding ----

feature('Binding assets to a motion plan', () => {
  const manifest = { assets: [{ id: 'pd1', url: 'u', source: 'loc', sourceUrl: 's', license: 'public domain', width: 2000, height: 1500 }] }
  const plan = { scenes: [{ beatId: 'hook' }, { beatId: 'payoff' }] }

  scenario('Binding a listed asset succeeds and the scene records it', () => {
    const bound = when('hook is bound to pd1 (which is in the manifest)', () => bindAssetsToPlan(plan, manifest, { hook: ['pd1'] }))
    then('the hook scene references pd1 and the plan validates', () => {
      assert.deepEqual(bound.scenes.find((s) => s.beatId === 'hook').assets, ['pd1'])
      assert.equal(validatePlanAssets(bound, manifest).valid, true)
    })
  })

  scenario('Binding an UNLISTED asset is refused (A3)', () => {
    then('binding throws', () => {
      assert.throws(() => bindAssetsToPlan(plan, manifest, { hook: ['ghost'] }), /not in the manifest/)
    })
  })

  scenario('Object-form scene assets ({id, localFile}) validate by their id', () => {
    const planObj = given('a plan whose scene carries an asset OBJECT for the renderer', () => ({ scenes: [{ beatId: 'hook', assets: [{ id: 'pd1', localFile: 'pd1.jpg', credit: 'LoC · CC0' }] }] }))
    const res = when('validated against the manifest', () => validatePlanAssets(planObj, manifest))
    then('it is valid (id resolves) ', () => assert.equal(res.valid, true))
    and('an object asset with an unlisted id still fails', () =>
      assert.equal(validatePlanAssets({ scenes: [{ beatId: 'hook', assets: [{ id: 'ghost', localFile: 'x' }] }] }, manifest).valid, false),
    )
  })

  scenario('A plan that references an unlisted asset fails validation', () => {
    const tampered = given('a plan whose scene points at an unlisted asset', () => ({ scenes: [{ beatId: 'hook', assets: ['ghost'] }] }))
    const res = when('the plan is validated against the manifest', () => validatePlanAssets(tampered, manifest))
    then('it is invalid', () => {
      assert.equal(res.valid, false)
      assert.match(res.errors[0], /unlisted asset/)
    })
  })
})
