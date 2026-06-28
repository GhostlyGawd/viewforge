import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyLicense, describeLicense, isUsable } from '../lib/asset-license.mjs'
import { forAll, gens } from './helpers/prop.mjs'
import { feature, scenario, given, when, then, and } from './helpers/bdd.mjs'

// Raw license strings grouped by the policy they MUST resolve to.
const PD = ['public domain', 'PDM', 'Public-Domain', 'no known restrictions', 'no known copyright', 'US Government Work', 'cc0', 'CC0 1.0', 'CC-Zero']
const BY = ['by', 'CC BY 4.0', 'by-sa', 'CC BY-SA 3.0', 'creative commons by', 'BY-SA']
const EXCLUDED = ['by-nc', 'CC BY-NC 4.0', 'by-nd', 'CC BY-ND', 'by-nc-nd', 'by-nc-sa', 'all rights reserved', 'copyright 2020', '', '   ', 'totally made up', 'arr']

// ---- A1: property — the gate's invariants hold over many generated inputs ----

test('A1 property: public-domain/CC0 is ALWAYS usable (with or without attribution)', () => {
  forAll(gens.pick(PD), (raw) => isUsable(raw, {}) === true && isUsable(raw, { attribution: 'x' }) === true)
})

test('A1 property: CC-BY / CC-BY-SA is usable IFF attribution is present', () => {
  forAll(gens.pick(BY), (raw) => isUsable(raw, {}) === false && isUsable(raw, { attribution: 'Jane / LoC' }) === true)
})

test('A1 property: NC / ND / unknown / ARR is NEVER usable, even with attribution', () => {
  forAll(gens.pick(EXCLUDED), (raw) => isUsable(raw, { attribution: 'x' }) === false)
})

test('A1 property: describeLicense.usable matches isUsable-with-attribution for every bucket', () => {
  forAll(gens.pick([...PD, ...BY, ...EXCLUDED]), (raw) => {
    const d = describeLicense(raw)
    // if the license is usable, then supplying attribution must make the gate pass
    return d.usable ? isUsable(raw, { attribution: 'x' }) === true : isUsable(raw, { attribution: 'x' }) === false
  })
})

// ---- A1: BDD — explicit scenarios ----

feature('Rights-clean license gate', () => {
  scenario('A monetized, edited channel rejects NonCommercial imagery', () => {
    const raw = given('a CC BY-NC image with full attribution', () => ({ license: 'CC BY-NC 4.0', attribution: 'A. Photographer' }))
    const usable = when('the gate evaluates it', () => isUsable(raw.license, { attribution: raw.attribution }))
    then('it is rejected (ads make the channel commercial)', () => assert.equal(usable, false))
  })

  scenario('NoDerivatives imagery is rejected because we crop and composite', () => {
    const usable = when('a CC BY-ND asset is evaluated', () => isUsable('CC BY-ND 4.0', { attribution: 'x' }))
    then('it is rejected', () => assert.equal(usable, false))
  })

  scenario('Public-domain imagery passes with no attribution needed', () => {
    const usable = when('a public-domain asset is evaluated', () => isUsable('no known restrictions', {}))
    then('it passes', () => assert.equal(usable, true))
  })

  scenario('CC-BY passes only once attribution is captured', () => {
    const without = when('CC-BY without attribution', () => isUsable('CC BY 4.0', {}))
    const withAttr = and('CC-BY with attribution', () => isUsable('CC BY 4.0', { attribution: 'Jane Doe' }))
    then('only the attributed one passes', () => {
      assert.equal(without, false)
      assert.equal(withAttr, true)
    })
  })

  scenario('An unclassifiable license is treated as unknown and rejected', () => {
    then('classify returns unknown and the gate rejects it', () => {
      assert.equal(classifyLicense('totally made up'), 'unknown')
      assert.equal(isUsable('totally made up', { attribution: 'x' }), false)
    })
  })
})
