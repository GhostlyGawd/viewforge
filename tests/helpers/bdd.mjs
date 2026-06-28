// bdd.mjs — a tiny zero-dependency BDD layer over node:test, so behavior reads as
// Feature / Scenario / Given–When–Then. given/when/then execute their step and return
// the value, so a scenario can thread state through the steps while documenting intent.

import { describe, it } from 'node:test'

export function feature(name, fn) {
  describe(`Feature: ${name}`, fn)
}

export function scenario(name, fn) {
  it(`Scenario: ${name}`, fn)
}

/** A step runs its callback and returns the result; the label documents the step. */
const step = (kind) => (label, fn) => {
  const r = typeof fn === 'function' ? fn() : fn
  return r
}

export const given = step('Given')
export const when = step('When')
export const then = step('Then')
export const and = step('And')
