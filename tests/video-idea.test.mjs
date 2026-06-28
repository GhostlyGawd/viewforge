import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scoreTitle, scoreVideoIdea, rankVideoIdeas } from '../lib/video-idea.mjs'

test('scoreTitle rewards intrigue, numbers, and superlatives', () => {
  const strong = scoreTitle('Why Nobody Survived The Deepest Hole On Earth')
  const weak = scoreTitle('a video about a hole')
  assert.ok(strong.score > weak.score)
  assert.ok(strong.signals.some((s) => s.includes('intrigue')))
})

test('scoreTitle penalizes titles that are too long or too short', () => {
  const tooLong = scoreTitle('I Survived ' + 'really '.repeat(15) + 'long title that truncates')
  assert.ok(tooLong.signals.some((s) => s.includes('too long')))
  const tooShort = scoreTitle('hole')
  assert.ok(tooShort.signals.some((s) => s.includes('too short')))
})

test('scoreVideoIdea HARD-BLOCKS an idea whose claim is not paid off', () => {
  const r = scoreVideoIdea({ title: 'I Gave Away $1,000,000', claimPaidOff: false, demand: 9 })
  assert.equal(r.blocked, true)
  assert.equal(r.score, 0)
  assert.ok(r.blockReason.includes('no-deceptive-clickbait'))
})

test('scoreVideoIdea scores an honest, well-packaged idea highly', () => {
  const r = scoreVideoIdea({
    title: 'Why The Biggest Star Would Swallow 1000 Suns',
    claimPaidOff: true,
    demand: 8,
    productionFit: 9,
    format: 'scale-comparison',
  })
  assert.equal(r.blocked, false)
  assert.ok(r.score > 60, `expected > 60, got ${r.score}`)
  assert.ok(r.breakdown.find((b) => b.key === 'packaging'))
})

test('format novelty penalizes a back-to-back repeat (encodes format-novelty)', () => {
  const idea = { title: 'The Most Extreme Planet Ever Found', claimPaidOff: true, demand: 7, productionFit: 8, format: 'countdown' }
  const fresh = scoreVideoIdea(idea, { recentFormats: ['scale-comparison', 'explainer'] })
  const repeat = scoreVideoIdea(idea, { recentFormats: ['countdown', 'explainer'] })
  assert.ok(fresh.score > repeat.score, 'repeating the previous format should score lower')
  assert.ok(repeat.breakdown.find((b) => b.key === 'formatNovelty').detail.includes('back-to-back'))
})

test('rankVideoIdeas sorts best-first and pushes blocked ideas to the bottom', () => {
  const ideas = [
    { title: 'clickbait', claimPaidOff: false, demand: 10 },
    { title: 'Why The Fastest Object In Space Breaks Physics', claimPaidOff: true, demand: 9, productionFit: 9, format: 'explainer' },
    { title: 'a thing', claimPaidOff: true, demand: 3, productionFit: 4, format: 'explainer' },
  ]
  const ranked = rankVideoIdeas(ideas, { recentFormats: [] })
  assert.equal(ranked[0].title, 'Why The Fastest Object In Space Breaks Physics')
  assert.equal(ranked.at(-1).blocked, true)
  assert.equal(ranked[0].rank, 1)
})

test('scoreVideoIdea throws without a title', () => {
  assert.throws(() => scoreVideoIdea({ demand: 5 }))
})
