// export-plans.mjs — render every channel's PLAN into a single self-contained,
// mobile-first HTML page (docs/index.html) so the operator can review the niche,
// brand, and locked video slate from a phone. The live channel state is local-only
// (gitignored), but this derived summary is safe + small to commit and serve via
// GitHub Pages. Re-run any time the plans change.
//
// Zero dependencies. Usage: node tools/export-plans.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listChannels, loadChannel } from '../lib/state.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..', 'state')
const outDir = path.join(here, '..', 'docs')

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const hex = (token, fallback = '#888') => {
  const m = String(token || '').match(/#[0-9a-fA-F]{3,8}/)
  return m ? m[0] : fallback
}

function swatches(palette = {}) {
  return ['bg', 'ink', 'accent', 'secondary']
    .filter((k) => palette[k])
    .map((k) => `<span class="sw" title="${esc(k)}: ${esc(palette[k])}" style="background:${hex(palette[k])}"></span>`)
    .join('')
}

function channelCard(c) {
  const accent = hex(c.brand?.palette?.accent, '#C8462C')
  const bg = hex(c.brand?.palette?.bg, '#15130f')
  const ink = hex(c.brand?.palette?.ink, '#f2efe6')
  const videos = (c.videos || [])
    .map(
      (v) => `<li class="vid">
        <div class="vt">${esc(v.title)}</div>
        <div class="vm"><span class="score">${v.score ?? '—'}</span> · ${esc(v.format || 'format n/a')} · <span class="stage">${esc(v.stage || 'idea')}</span></div>
        ${v.thumbnailConcept ? `<div class="vc">▸ ${esc(v.thumbnailConcept)}</div>` : ''}
      </li>`,
    )
    .join('')
  const tone = (c.brand?.voiceGuide?.toneWords || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('')
  return `<article class="card" style="--accent:${accent};--cardbg:${bg};--cardink:${ink}">
    <header>
      <div class="badge">${esc(c.stage)}</div>
      <h2>${esc(c.brand?.name || c.name)}</h2>
      ${c.brand?.tagline ? `<p class="tag-line">“${esc(c.brand.tagline)}”</p>` : ''}
      <div class="palette">${swatches(c.brand?.palette)}</div>
    </header>
    <section>
      <div class="row"><span class="k">Niche</span><span class="v">${esc(c.niche?.name || '—')} ${c.niche?.score ? `<span class="score">${c.niche.score}</span>` : ''}</span></div>
      ${c.brand?.audience ? `<div class="row"><span class="k">Audience</span><span class="v">${esc(c.brand.audience)}</span></div>` : ''}
      ${c.brand?.wowFactor ? `<div class="row"><span class="k">Wow factor</span><span class="v">${esc(c.brand.wowFactor)}</span></div>` : ''}
      ${tone ? `<div class="row"><span class="k">Voice</span><span class="v">${tone}</span></div>` : ''}
    </section>
    <section>
      <div class="k">Locked videos (${(c.videos || []).length})</div>
      <ul class="vids">${videos || '<li class="vid muted">none yet</li>'}</ul>
    </section>
  </article>`
}

function page(cards, stamp) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ViewForge — Channel Plans</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;background:#0c0b0a;color:#ece7dc;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
  .wrap{max-width:760px;margin:0 auto;padding:20px 16px 64px}
  .top h1{font-size:24px;margin:0 0 4px;letter-spacing:.5px}
  .top p{margin:0 0 20px;color:#9a948a;font-size:14px}
  .card{background:var(--cardbg);color:var(--cardink);border:1px solid #ffffff14;border-radius:16px;padding:18px;margin:0 0 18px;overflow:hidden}
  .card header{border-bottom:1px solid #ffffff1a;padding-bottom:12px;margin-bottom:12px;position:relative}
  .badge{position:absolute;top:0;right:0;font-size:11px;letter-spacing:1px;text-transform:uppercase;background:var(--accent);color:#0c0b0a;padding:3px 9px;border-radius:99px;font-weight:700}
  .card h2{margin:0 0 2px;font-size:22px}
  .tag-line{margin:0;color:var(--cardink);opacity:.7;font-style:italic;font-size:14px}
  .palette{margin-top:12px;display:flex;gap:8px}
  .sw{width:26px;height:26px;border-radius:6px;border:1px solid #ffffff2a;display:inline-block}
  .row{display:flex;gap:10px;padding:5px 0;font-size:14px}
  .row .k{flex:0 0 84px;color:var(--cardink);opacity:.55;text-transform:uppercase;font-size:11px;letter-spacing:.6px;padding-top:2px}
  .row .v{flex:1}
  section .k{display:block;color:var(--cardink);opacity:.55;text-transform:uppercase;font-size:11px;letter-spacing:.6px;margin:8px 0 6px}
  .vids{list-style:none;margin:0;padding:0}
  .vid{padding:9px 0;border-top:1px solid #ffffff12}
  .vid:first-child{border-top:0}
  .vt{font-weight:600}
  .vm{font-size:12.5px;opacity:.65;margin-top:2px}
  .vc{font-size:12.5px;opacity:.5;margin-top:2px}
  .score{display:inline-block;background:var(--accent);color:#0c0b0a;border-radius:5px;padding:0 6px;font-weight:700;font-size:12px}
  .stage{opacity:.8}
  .tag{display:inline-block;border:1px solid currentColor;opacity:.7;border-radius:99px;padding:1px 9px;font-size:12px;margin-right:5px}
  .muted{opacity:.5}
  footer{color:#6f6a61;font-size:12px;text-align:center;margin-top:28px}
  footer a{color:#9a948a}
</style></head>
<body><div class="wrap">
  <div class="top">
    <h1>ViewForge · Channel Plans</h1>
    <p>${cards.length} channel${cards.length === 1 ? '' : 's'} · generated ${esc(stamp)} · tap-friendly, mobile-first</p>
  </div>
  ${cards.join('\n')}
  <footer>Generated from local channel state by <code>tools/export-plans.mjs</code>.<br>Live plans stay on the operator's machine; this is a derived snapshot.</footer>
</div></body></html>`
}

const slugs = listChannels(root)
if (!slugs.length) {
  console.error('export-plans: no channels found in state/channels/')
  process.exit(1)
}
const cards = slugs.map((s) => channelCard(loadChannel(root, s)))
const stamp = process.argv[2] || 'local build'
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'index.html'), page(cards, stamp))
console.log(`export-plans: wrote docs/index.html for ${slugs.length} channel(s): ${slugs.join(', ')}`)
