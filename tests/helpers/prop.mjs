// prop.mjs — a tiny zero-dependency property-testing harness.
//
// forAll(gen, predicate, opts) runs `predicate` over many generated inputs and throws
// with the counterexample if any fails. The PRNG is SEEDED (deterministic) so CI is
// stable and failures reproduce. Generators take the rng and return a value.

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param {(rng:()=>number)=>any} gen produce one input from the rng
 * @param {(x:any)=>(boolean|void)} predicate return false (or throw) to fail
 * @param {{runs?:number, seed?:number}} opts
 */
export function forAll(gen, predicate, { runs = 200, seed = 0x9e3779b9 } = {}) {
  const rng = mulberry32(seed)
  for (let i = 0; i < runs; i++) {
    const x = gen(rng)
    let ok
    try {
      ok = predicate(x)
    } catch (e) {
      e.message = `property threw on run ${i} — counterexample=${safe(x)}\n  ${e.message}`
      throw e
    }
    if (ok === false) {
      throw new Error(`property failed on run ${i} — counterexample=${safe(x)}`)
    }
  }
}

const safe = (x) => {
  try {
    return JSON.stringify(x)
  } catch {
    return String(x)
  }
}

export const gens = {
  int: (min, max) => (rng) => min + Math.floor(rng() * (max - min + 1)),
  float: (min, max) => (rng) => min + rng() * (max - min),
  bool: () => (rng) => rng() < 0.5,
  pick: (arr) => (rng) => arr[Math.floor(rng() * arr.length)],
  // build an object whose fields are each a generator
  record: (shape) => (rng) => Object.fromEntries(Object.entries(shape).map(([k, g]) => [k, g(rng)])),
  array: (gen, min, max) => (rng) => {
    const n = min + Math.floor(rng() * (max - min + 1))
    return Array.from({ length: n }, () => gen(rng))
  },
}
