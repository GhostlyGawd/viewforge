import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonicalJson, renderKey, planSceneRenders, dirtyScenes, concatPlan } from '../lib/render-cache.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

// Build the same object with two different key-insertion orders.
const shuffledPair = (rng) => {
  const n = gens.int(1, 8)(rng)
  const keys = Array.from({ length: n }, (_, i) => 'k' + i)
  const vals = keys.map(() => gens.pick([1, 'x', true, null, [1, 2], { a: 1 }])(rng))
  const forward = Object.fromEntries(keys.map((k, i) => [k, vals[i]]))
  const backward = {}
  for (let i = keys.length - 1; i >= 0; i--) backward[keys[i]] = vals[i]
  return { forward, backward }
}

test('property: C1 — canonicalJson is key-order independent and stable', () => {
  forAll(
    shuffledPair,
    ({ forward, backward }) => canonicalJson(forward) === canonicalJson(backward) && canonicalJson({ nest: forward }) === canonicalJson({ nest: backward }),
    { runs: 300 },
  )
})

test('canonicalJson refuses ambiguity: non-finite numbers and functions have no canonical form; array order is preserved', () => {
  assert.throws(() => canonicalJson({ x: NaN }), /non-finite/)
  assert.throws(() => canonicalJson({ x: Infinity }), /non-finite/)
  assert.throws(() => canonicalJson({ f: () => {} }), /no canonical/)
  assert.notEqual(canonicalJson([1, 2]), canonicalJson([2, 1]))
  assert.equal(canonicalJson({ a: 1, b: undefined }), canonicalJson({ a: 1 })) // undefined = absent, JSON semantics
})

const ctx = { brandVersion: 'brand@3', rendererVersion: 'remotion-template@0.9.0' }

test('property: C2 — renderKey changes iff scene content, brand, an asset hash, or renderer changes', () => {
  forAll(
    gens.record({ dur: gens.int(1000, 9000), text: gens.pick(['a', 'b', 'c']), flip: gens.pick(['none', 'scene', 'brand', 'renderer', 'asset']) }),
    ({ dur, text, flip }) => {
      const scene = { beatId: 'hook', resolvedDurationMs: dur, onScreenText: [text] }
      const assetHashes = ['sha256:img1', 'sha256:vo1']
      const base = renderKey({ scene, ...ctx, assetHashes })
      const variant = renderKey({
        scene: flip === 'scene' ? { ...scene, resolvedDurationMs: dur + 1 } : scene,
        brandVersion: flip === 'brand' ? 'brand@4' : ctx.brandVersion,
        rendererVersion: flip === 'renderer' ? 'remotion-template@1.0.0' : ctx.rendererVersion,
        assetHashes: flip === 'asset' ? ['sha256:img2', 'sha256:vo1'] : assetHashes,
      })
      return flip === 'none' ? variant === base : variant !== base
    },
    { runs: 400 },
  )
})

test('renderKey treats asset hashes as a SET (order never matters) and demands versioned inputs', () => {
  const scene = { beatId: 'x' }
  const a = renderKey({ scene, ...ctx, assetHashes: ['h1', 'h2'] })
  const b = renderKey({ scene, ...ctx, assetHashes: ['h2', 'h1'] })
  assert.equal(a, b)
  assert.throws(() => renderKey({ scene, rendererVersion: 'r@1' }), /brandVersion/)
  assert.throws(() => renderKey({ scene, brandVersion: 'b@1' }), /rendererVersion/)
})

test('property: C3 — planSceneRenders re-renders exactly the cache misses; a one-scene edit dirties exactly that scene', () => {
  forAll(
    gens.record({ n: gens.int(2, 9), editIdx: gens.int(0, 8), cachedCount: gens.int(0, 9) }),
    ({ n, editIdx, cachedCount }) => {
      const entries = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, scene: { beatId: `s${i}`, text: `t${i}` }, assetHashes: [`h${i}`] }))
      const first = planSceneRenders(entries, {}, ctx)
      // cache the first `cachedCount` renders, then re-plan: hits come from cache
      const index = Object.fromEntries(first.jobs.slice(0, Math.min(cachedCount, n)).map((j) => [j.renderKey, `out/${j.id}.mp4`]))
      const second = planSceneRenders(entries, index, ctx)
      const hits = Math.min(cachedCount, n)
      if (second.fromCache.length !== hits || second.toRender.length !== n - hits) return false
      // edit ONE scene → exactly that scene goes dirty vs the previous plan
      const i = editIdx % n
      const edited = entries.map((e, j) => (j === i ? { ...e, scene: { ...e.scene, text: 'EDITED' } } : e))
      const third = planSceneRenders(edited, index, ctx)
      const diff = dirtyScenes(second.jobs, third.jobs)
      return diff.dirty.length === 1 && diff.dirty[0] === `s${i}` && diff.unchanged.length === n - 1 && diff.removed.length === 0
    },
    { runs: 250 },
  )
})

const params = { codec: 'h264', width: 1920, height: 1080, fps: 30, pixFmt: 'yuv420p', audioCodec: 'aac', audioRate: 48000 }

test('property: C4 — concatPlan rejects ANY codec-param mismatch and orders by resolved start', () => {
  forAll(
    gens.record({ n: gens.int(2, 8), mismatch: gens.bool(), field: gens.pick(['fps', 'width', 'pixFmt', 'audioRate']) }),
    ({ n, mismatch, field }) => {
      const renders = Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        path: `out/s${i}.mp4`,
        startMs: (n - 1 - i) * 4000, // deliberately reversed input order
        codecParams: { ...params },
      }))
      if (mismatch) renders[n - 1].codecParams = { ...params, [field]: field === 'pixFmt' ? 'yuv444p' : params[field] + 1 }
      const plan = concatPlan(renders)
      if (mismatch) return plan.valid === false && plan.segments.length === 0
      const orderedIds = plan.segments.map((s) => s.id)
      return plan.valid && orderedIds.join(',') === [...renders].sort((a, b) => a.startMs - b.startMs).map((r) => r.id).join(',')
    },
    { runs: 250 },
  )
})

feature('Per-scene render cache (Master Doc v2 §6/§22)', () => {
  scenario('An unchanged video re-renders nothing on the second pass', () => {
    const entries = given('three scenes', () => [
      { id: 'hook', scene: { t: 1 }, assetHashes: ['a'] },
      { id: 'body', scene: { t: 2 }, assetHashes: ['b'] },
      { id: 'cta', scene: { t: 3 }, assetHashes: [] },
    ])
    const first = when('the first plan renders all', () => planSceneRenders(entries, {}, ctx))
    const index = and('the artifacts are cached by key', () => Object.fromEntries(first.jobs.map((j) => [j.renderKey, `out/${j.id}.mp4`])))
    then('a re-plan is 100% cache hits', () => {
      const second = planSceneRenders(entries, index, ctx)
      assert.deepEqual(second.toRender, [])
      assert.deepEqual(second.fromCache, ['hook', 'body', 'cta'])
      assert.ok(second.jobs.every((j) => j.artifact))
    })
  })

  scenario('A renderer upgrade invalidates every scene (correctness over thrift)', () => {
    const entries = [{ id: 'hook', scene: { t: 1 }, assetHashes: [] }]
    const before = planSceneRenders(entries, {}, ctx).jobs
    const after = planSceneRenders(entries, {}, { ...ctx, rendererVersion: 'remotion-template@1.0.0' }).jobs
    then('the key changed', () => assert.notEqual(before[0].renderKey, after[0].renderKey))
  })

  scenario('The concat list escapes awkward paths for the ffmpeg demuxer', () => {
    const plan = when("a path contains a single quote", () =>
      concatPlan([{ id: 'a', path: "out/it's.mp4", startMs: 0, codecParams: params }]),
    )
    then('the emitted list is demuxer-safe', () => {
      assert.equal(plan.valid, true)
      assert.match(plan.concatList, /file 'out\/it'\\''s\.mp4'/)
    })
  })

  scenario('Missing pieces are named, not guessed', () => {
    then('a render without a path, startMs, or codecParams is rejected with its id', () => {
      const r = concatPlan([{ id: 'x', startMs: 0, codecParams: params }, { id: 'y', path: 'p', codecParams: params }, { id: 'z', path: 'p', startMs: 0 }])
      assert.equal(r.valid, false)
      assert.match(r.issues.join(';'), /x: missing rendered file/)
      assert.match(r.issues.join(';'), /y: missing startMs/)
      assert.match(r.issues.join(';'), /z: missing codecParams/)
    })
  })
})
