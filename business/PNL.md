# ViewForge P&L — operating statement

Run like a business (operator mandate, 2026-07-12): every service documented and
priced in `services.json`, spend capped in code, paid adoptions gated on measured
triggers, unit economics computed by `lib/business.mjs` — never asserted.

## Current actuals (2026-07)

| line | USD/mo | note |
|------|--------|------|
| Revenue | **$0** | pre-launch; no published videos yet |
| COGS (per-video × cadence) | **$0** | entire pipeline currently free/open-source |
| Fixed (subscriptions) | **$0** | none |
| **Net** | **$0** | |

Spend cap: **$100/mo** (`monthlySpendCapUsd`, CI-enforced). Raising it is a commit.

## The operating rules

1. **Free/open-source first** — a paid service enters `services.json` as
   `paid-planned` with pricing and an **adoption trigger**: the measurable condition
   (calibration-ledger or analytics evidence) under which paying is justified.
2. **No unexplained dependencies** — every service, free or paid, carries a decision
   record (rationale, alternatives considered, date). CI rejects violations exactly
   like unsourced strategies.
3. **The cap is the solo-dev guard** — projected monthly spend over the cap fails
   CI. `canAdoptPaidService` refuses adoption without trigger evidence AND cap room.
4. **Revenue numbers are hypotheses until the analytics loop reports real ones** —
   RPM/view assumptions are labeled as such everywhere they appear.
5. **Actuals get recorded monthly** in this file once real money moves, alongside
   the model's projection for the same month — so the model itself is calibrated,
   like the rubric.

## Worked projection (hypotheses, not facts)

Assumptions: 8 videos/mo · 10,000 views/video · net RPM $4 (education long-form
commonly $3–12; ours is unknown until measured).

- Revenue ≈ 8 × 10,000 × $4/1000 = **$320/mo**
- COGS today: **$0** → net **$320/mo** at those assumptions
- If ElevenLabs adopts at its trigger (+$5/mo + ~$0.30/video): cost ≈ $7.40/mo →
  break-even ≈ **232 views/video**. The paid tier pays for itself at trivially
  small audiences — the point of the cap is discipline, not austerity.

## Paid pipeline (status + triggers live in services.json)

| service | est. cost | status | trigger |
|---------|-----------|--------|---------|
| ElevenLabs voice | ~$5/mo + ~$0.30/video | planned | voice still <6/10 in operator scores AFTER free open-voice upgrade + direction layer |
| GPU rental | ~$0.30–0.60/hr (~$1/video) | planned | an adopted open-weights model needs faster-than-CPU inference |
| genAI video (Veo/Kling) | ~$0.10–0.50/clip | parked | only if a cinematic live-action layer joins the chosen authored-animation direction |
| Remotion Automators | $0.01/render, $100/mo min | future liability | company-scale automation (>3 people / incorporated) — documented so it never surprises us |
