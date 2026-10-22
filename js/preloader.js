/* Fire Serpent — preloader, two variants over one loading core.
 * ---------------------------------------------------------------------------
 * B (default, ?preloader=b) "the door": a photoreal basalt door with a carved
 *   calendar medallion; molten gold runs out from the keyhole through the
 *   carved channels as the site loads, the glyph cartouches ignite, and at
 *   100% the leaves slide apart into the first station. WebGL, with a 2D
 *   canvas fallback. Maps: assets/preloader/, authored by scripts/preloader-b/.
 * A (?preloader=a) "the calendar stone": the SVG ring of twenty day signs.
 *
 * PROGRESS IS REAL. Nothing here downloads media. It watches what
 * js/sequence.js is already doing:
 *   - the manifest (window.sequence.stations filled in),
 *   - the display/body fonts (document.fonts),
 *   - the first station's loop <video> (buffered range, readyState) and the
 *     `sequence:ready` event (first frame actually presented),
 *   - the first station's outgoing transition <video>, which sequence.js
 *     creates with preload="auto" in warmWindow() right after ready.
 * The plates are found by their data-clip url, read from the manifest, so
 * the hashed names of the deployed build work unchanged.
 * Shown for at least MIN_MS, never longer than MAX_MS. A transition whose
 * buffer stops growing for STALL_MS after ready (iOS ignores preload) counts
 * as done, so a phone is not held to the hard timeout. B also waits for its
 * own three maps (they are small and requested first); if they fail, A runs.
 *
 * ?preloader=b&clock=manual&film=1  the real page on a manual clock, with the
 *                  synthetic fill curve: frame-exact recordings of the reveal
 *                  and the hero's entrance behind it (scripts/preloader-b/).
 * ?preloader=demo  loops the animation with no site behind (recording)
 *                  &v=a|b picks the variant (default b)
 *                  &fill=<seconds> sets the fill duration (default 8)
 *                  &clock=manual freezes time: window.preloader.step(ms)
 *                  advances it and draws one frame (frame-exact capture)
 *                  &gl=0 forces B's 2D fallback
 * ?preloader=a|b   picks the variant on the live page
 * ?preloader=off   skips the preloader (QA)
 */
(() => {
  'use strict';

  const root = document.getElementById('preloader');
  if (!root) return;
  const doc = document.documentElement;
  const params = new URLSearchParams(location.search);
  const mode = params.get('preloader');
  const DEMO = mode === 'demo';
  const VARIANT = mode === 'a' || (DEMO && params.get('v') === 'a') ? 'a' : 'b';
  root.classList.add('pl-js');            // cancels the CSS failsafe
  if (mode === 'off') { root.remove(); return; }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MAX_MS = 11000;
  const STALL_MS = 2500;
  const FILL_MS = Math.max(2, Math.min(30, Number(params.get('fill')) || 8)) * 1000;
  const MANUAL = params.get('clock') === 'manual' && (DEMO || params.get('film') === '1');
  const FILM = MANUAL && !DEMO;          // real page, synthetic fill, exact clock

  /* The clock. In manual mode time only moves through window.preloader.step(). */
  let vnow = 0;
  const now = MANUAL ? () => vnow : () => performance.now();
  const timers = new Set();
  const vtimers = [];
  function after(ms, fn) {
    if (MANUAL) { vtimers.push({ at: vnow + ms, fn }); return; }
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  }
  function runVirtualTimers() {
    for (;;) {
      vtimers.sort((a, b) => a.at - b.at);
      if (!vtimers.length || vtimers[0].at > vnow) return;
      vtimers.shift().fn();
    }
  }

  if (DEMO) doc.classList.add('pl-demo');
  doc.classList.add('pl-hold');           // holds the station copy until the reveal

  /* ================================================================ A ===
   * A carved ring of twenty day-sign glyphs around a feathered-serpent emblem.
   * Loading progress is gold light: the groove fills, the glyphs ignite one by
   * one, the emblem floods with jade and gold from below. At 100% the serpent's
   * eyes ignite, a gold flash fires, the stone splits into two halves and the
   * overlay fades into the first station.
   * Only transform and opacity animate, plus one dash offset on the groove arc.
   * No filters: glows are radial gradients and wide low-opacity strokes.
   */
  function variantA() {
    const N = 20;
    const R_GLYPH = 372;                  // glyph ring radius, in the 1000-unit ring box
    const R_GROOVE = 270;
    const C_GROOVE = 2 * Math.PI * R_GROOVE;
    root.classList.remove('pl-b');
    /* ------------------------------------------------------------ artwork */

    /* Twenty original geometric day signs, drawn in a 100-unit box, loosely
       after the tzolk'in sequence. Dots take currentColor, lines the stroke. */
    const DAYS = ['IMIX', 'IK’', 'AK’BAL', 'K’AN', 'CHIKCHAN', 'KIMI', 'MANIK’', 'LAMAT', 'MULUK', 'OK',
      'CHUWEN', 'EB', 'BEN', 'IX', 'MEN', 'KIB', 'KABAN', 'ETZ’NAB', 'KAWAK', 'AJAW'];
    const dot = (x, y, r = 3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor"/>`;
    const GLYPHS = [
      `<path d="M26 38q8-8 16 0t16 0t16 0M26 54q8-8 16 0t16 0t16 0"/>${dot(34, 68)}${dot(50, 68)}${dot(66, 68)}`,
      `<path d="M28 28h44M50 28v44M36 72h28M36 44q14 10 28 0"/>`,
      `<path d="M26 48h48M30 48a10 10 0 0 1 20 0M50 48a10 10 0 0 1 20 0M34 60v10M50 60v14M66 60v10"/>`,
      `<rect x="34" y="34" width="32" height="32" rx="7"/>${dot(50, 50, 5)}${dot(24, 26)}${dot(76, 26)}${dot(24, 74)}${dot(76, 74)}`,
      `<path d="M50 24 76 50 50 76 24 50zM37 37l26 26M63 37 37 63"/>`,
      `<path d="M30 58V44a20 20 0 0 1 40 0v14zM30 58v12h40V58M40 58v12M50 58v12M60 58v12"/>${dot(41, 45, 4)}${dot(59, 45, 4)}`,
      `<path d="M30 62V42a5 5 0 0 1 10 0v10M40 50V32a5 5 0 0 1 10 0v18M50 50V36a5 5 0 0 1 10 0v14M60 52v-6a5 5 0 0 1 10 0v14q0 16-16 16h-8q-10 0-16-14"/>`,
      `<path d="M50 22 57 43 78 50 57 57 50 78 43 57 22 50 43 43z"/>${dot(50, 50, 4)}`,
      `<circle cx="50" cy="50" r="21"/><circle cx="50" cy="50" r="8"/><path d="M50 24v-4M50 80v-4M24 50h-4M80 50h-4"/>`,
      `<path d="M28 72V34l12 12 10-16 10 16 12-12v38z"/>${dot(42, 57, 3.5)}${dot(58, 57, 3.5)}`,
      `<path d="M50 50a4 4 0 1 1 4 4 8 8 0 0 1-8-8 12 12 0 0 1 12-12 16 16 0 0 1 16 16 20 20 0 0 1-20 20 24 24 0 0 1-24-24"/>`,
      `<path d="M24 74h14V62h12V50h12V38h14M24 74h52V38"/>${dot(31, 67, 2.5)}`,
      `<path d="M36 24v52M50 24v52M64 24v52M28 40h44M28 60h44"/>`,
      `<circle cx="37" cy="38" r="9"/><circle cx="63" cy="38" r="9"/><circle cx="50" cy="63" r="9"/>${dot(37, 38, 2.6)}${dot(63, 38, 2.6)}${dot(50, 63, 2.6)}`,
      `<path d="M24 40 50 26l26 14M24 56l26-14 26 14M24 72l26-14 26 14"/>`,
      `<path d="M28 72q0-42 38-42 10 0 10 10 0 18-20 18-8 0-8-8 0-6 6-6M28 72h46"/>`,
      `<path d="M24 34q26-13 52 0M24 50q26 13 52 0M24 66q26-13 52 0"/>${dot(50, 78)}`,
      `<path d="M50 20 67 50 50 80 33 50zM50 20v60M42 36h16M40 64h20"/>`,
      `<path d="M24 56a10 10 0 0 1 20 0 10 10 0 0 1 20 0 M36 40a10 10 0 0 1 20 0 9 9 0 0 1 18 0 M36 66l-4 10M52 66l-4 10M68 66l-4 10M24 56h40"/>`,
      `<circle cx="50" cy="50" r="15"/><path d="M50 22v7M50 71v7M22 50h7M71 50h7M30 30l5 5M65 65l5 5M70 30l-5 5M35 65l-5 5M44 56q6 4 12 0"/>${dot(45, 46, 2.4)}${dot(55, 46, 2.4)}`
    ];
    const FRAME = 'M22 12h56a14 14 0 0 1 14 14v44a14 14 0 0 1-14 14H22A14 14 0 0 1 8 70V26a14 14 0 0 1 14-14ZM30 92h12M58 92h12';
    const f = n => +n.toFixed(2);

    const glyphDefs = GLYPHS.map((g, k) =>
      `<g id="plG${k}" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${FRAME}"/>` +
      `<g transform="translate(50 48) scale(.84) translate(-50 -50)">${g}</g></g>`).join('');

    function stoneArt() {
      let s = '<circle cx="500" cy="500" r="494" fill="url(#plStoneG)"/>' +
        '<circle cx="500" cy="500" r="492" fill="none" stroke="#453a2e" stroke-width="3"/>' +
        '<circle cx="500" cy="500" r="480" fill="none" stroke="#2a231c" stroke-width="2"/>' +
        '<circle cx="500" cy="500" r="454" fill="none" stroke="#2a231c" stroke-width="2"/>' +
        '<circle cx="500" cy="500" r="318" fill="none" stroke="#2a231c" stroke-width="2"/>' +
        '<circle cx="500" cy="500" r="270" fill="none" stroke="#050404" stroke-width="20"/>' +
        '<circle cx="500" cy="500" r="258" fill="none" stroke="#342b22" stroke-width="1.5"/>' +
        '<circle cx="500" cy="500" r="282" fill="none" stroke="#342b22" stroke-width="1.5"/>' +
        '<circle cx="500" cy="500" r="252" fill="#13100d"/>';
      for (let i = 0; i < 72; i++) {
        const a = i * 5 * Math.PI / 180;
        s += `<circle cx="${f(500 + 467 * Math.sin(a))}" cy="${f(500 - 467 * Math.cos(a))}" r="4.3" fill="#342c24"/>`;
      }
      for (let i = 0; i < 32; i++) {
        const a = (i + 0.5) * 11.25 * Math.PI / 180;
        s += `<circle cx="${f(500 + 241 * Math.sin(a))}" cy="${f(500 - 241 * Math.cos(a))}" r="3" fill="#2a231c"/>`;
      }
      let ticks = '';
      for (let i = 0; i < 100; i++) ticks += `<path transform="rotate(${i * 3.6} 500 500)" d="${i % 5 ? 'M500 196v9' : 'M500 192v16'}"/>`;
      s += `<g stroke="#3a3128" stroke-width="2">${ticks}</g>`;
      for (let k = 0; k < N; k++) {
        const y = 500 - R_GLYPH - 50;
        s += `<g transform="rotate(${9 + 18 * k} 500 500)">` +
          `<rect x="454" y="${y + 6}" width="92" height="84" rx="16" fill="#100e0b" stroke="#2c251e" stroke-width="1.5"/>` +
          `<use href="#plG${k}" transform="translate(450 ${y + 1.8})" stroke="#050404" stroke-width="5" color="#050404"/>` +
          `<use href="#plG${k}" transform="translate(450 ${y})" stroke="#40372c" stroke-width="3" color="#40372c"/></g>` +
          `<path transform="rotate(${18 * k} 500 500)" d="M500 ${500 - R_GLYPH - 12}l7 12-7 12-7-12z" fill="#2f281f"/>`;
      }
      return s;
    }

    /* The emblem: a frontal feathered serpent in a 400-unit box. The same
       drawing twice — carved stone, and the lit jade-and-gold version. */
    function emblem(lit) {
      const c = lit ? {
        feather: 'url(#plJade)', fStroke: 'url(#plGoldE)', quill: '#fff0b8', disc: '#062b1d', bead: '#ffd766',
        head: 'url(#plJadeHead)', hStroke: 'url(#plGoldE)', fili: 'url(#plGoldE)', scale: 'url(#plGoldE)',
        mouth: '#2a0703', fang: 'url(#plGoldE)', tongue: '#ff7a3c', eye: 'url(#plGoldE)', pupil: '#140903', nostril: '#062b1d'
      } : {
        feather: '#1a1612', fStroke: '#3a3128', quill: '#2a231c', disc: '#0f0d0a', bead: '#2f2821',
        head: '#1d1814', hStroke: '#453b30', fili: '#3a3128', scale: '#332b23',
        mouth: '#0a0807', fang: '#3a3128', tongue: '#2a231c', eye: '#2a231c', pupil: '#0a0807', nostril: '#0a0807'
      };
      let feathers = '';
      for (let k = 0; k < 16; k++) {
        const tip = k % 2 ? 30 : 14;
        feathers += `<g transform="rotate(${k * 22.5 + 11.25} 200 200)">` +
          `<path d="M200 106C184 ${tip + 62} 186 ${tip + 24} 200 ${tip}C214 ${tip + 24} 216 ${tip + 62} 200 106Z" fill="${c.feather}" stroke="${c.fStroke}" stroke-width="2.4"/>` +
          `<path d="M200 100V${tip + 16}" stroke="${c.quill}" stroke-width="1.4" fill="none"/></g>`;
      }
      let beads = '';
      for (let k = 0; k < 16; k++) {
        const a = k * 22.5 * Math.PI / 180;
        beads += `<circle cx="${f(200 + 112 * Math.sin(a))}" cy="${f(200 - 112 * Math.cos(a))}" r="3.4" fill="${c.bead}"/>`;
      }
      let scales = '';
      [[120, 12], [146, 11], [170, 10], [194, 9], [216, 8], [236, 7]].forEach(([y, s]) => {
        scales += `<path d="M200 ${y - s}l${s} ${s}-${s} ${s}-${s}-${s}z"/>`;
      });
      return `<svg viewBox="0 0 400 400" aria-hidden="true">${feathers}` +
        `<circle cx="200" cy="200" r="118" fill="${c.disc}" stroke="${c.fStroke}" stroke-width="3"/>${beads}` +
        `<g transform="translate(0 -18)" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M168 300C174 338 226 338 232 300C222 312 178 312 168 300Z" fill="${c.mouth}" stroke="${c.hStroke}" stroke-width="2"/>` +
        `<path d="M178 304C176 322 178 338 187 352C187 336 189 322 191 308Z" fill="${c.fang}"/>` +
        `<path d="M222 304C224 322 222 338 213 352C213 336 211 322 209 308Z" fill="${c.fang}"/>` +
        `<path d="M200 312V344M200 344l-10 16M200 344l10 16" stroke="${c.tongue}" stroke-width="4" fill="none"/>` +
        `<path d="M200 96C252 96 290 124 292 170C294 208 272 238 248 258C240 276 236 292 228 302C218 314 182 314 172 302C164 292 160 276 152 258C128 238 106 208 108 170C110 124 148 96 200 96Z" fill="${c.head}" stroke="${c.hStroke}" stroke-width="4"/>` +
        `<g fill="none" stroke="${c.scale}" stroke-width="2.4">${scales}</g>` +
        `<g fill="none" stroke="${c.fili}" stroke-width="3.2">` +
        `<path d="M126 150C136 124 170 116 186 134C174 132 164 138 166 150"/><path d="M274 150C264 124 230 116 214 134C226 132 236 138 234 150"/>` +
        `<path d="M140 212c-10-2-14 10-6 14 8 4 16-4 10-12"/><path d="M260 212c10-2 14 10 6 14-8 4-16-4-10-12"/>` +
        `<path d="M122 194q16 28 44 42M278 194q-16 28-44 42"/></g>` +
        `<path d="M124 176C137 157 165 157 178 176C165 194 137 194 124 176Z" fill="${c.eye}" stroke="${c.hStroke}" stroke-width="2"/>` +
        `<path d="M222 176C235 157 263 157 276 176C263 194 235 194 222 176Z" fill="${c.eye}" stroke="${c.hStroke}" stroke-width="2"/>` +
        `<path d="M151 164C146 171 146 181 151 188C156 181 156 171 151 164Z" fill="${c.pupil}"/>` +
        `<path d="M249 164C244 171 244 181 249 188C254 181 254 171 249 164Z" fill="${c.pupil}"/>` +
        `<circle cx="186" cy="286" r="3.4" fill="${c.nostril}"/><circle cx="214" cy="286" r="3.4" fill="${c.nostril}"/>` +
        `</g></svg>`;
    }

    const DEFS = `<svg class="pl-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>` +
      `<linearGradient id="plGold" gradientUnits="userSpaceOnUse" x1="20" y1="10" x2="80" y2="92"><stop offset="0" stop-color="#fff7d6"/><stop offset=".32" stop-color="#ffd95e"/><stop offset=".68" stop-color="#f4a323"/><stop offset="1" stop-color="#c46a0e"/></linearGradient>` +
      `<linearGradient id="plGoldE" gradientUnits="userSpaceOnUse" x1="120" y1="60" x2="290" y2="360"><stop offset="0" stop-color="#fff5cf"/><stop offset=".35" stop-color="#ffd24f"/><stop offset=".72" stop-color="#f09a1f"/><stop offset="1" stop-color="#b85f0c"/></linearGradient>` +
      `<linearGradient id="plGoldR" gradientUnits="userSpaceOnUse" x1="230" y1="230" x2="770" y2="770"><stop offset="0" stop-color="#fff3c2"/><stop offset=".45" stop-color="#ffc73d"/><stop offset="1" stop-color="#e8751f"/></linearGradient>` +
      `<radialGradient id="plJade" gradientUnits="userSpaceOnUse" cx="200" cy="200" r="196"><stop offset=".5" stop-color="#07472f"/><stop offset=".78" stop-color="#15a266"/><stop offset="1" stop-color="#8af5bf"/></radialGradient>` +
      `<linearGradient id="plJadeHead" gradientUnits="userSpaceOnUse" x1="200" y1="96" x2="200" y2="314"><stop offset="0" stop-color="#34e39a"/><stop offset=".5" stop-color="#119160"/><stop offset="1" stop-color="#084a31"/></linearGradient>` +
      `<radialGradient id="plStoneG" gradientUnits="userSpaceOnUse" cx="500" cy="440" r="560"><stop offset="0" stop-color="#27211b"/><stop offset=".7" stop-color="#1a1612"/><stop offset="1" stop-color="#0f0d0a"/></radialGradient>` +
      `${glyphDefs}<g id="plStone">${stoneArt()}</g></defs></svg>`;

    function glyphEl(k) {
      return `<div class="pl-glyph" style="--r:${9 + 18 * k}deg;--k:${k}" data-k="${k}">` +
        '<i class="pl-gh"></i>' +
        `<svg viewBox="0 0 100 100" aria-hidden="true">` +
        `<use href="#plG${k}" stroke="#ffb838" stroke-width="11" color="#ffb838" opacity=".2"/>` +
        `<use href="#plG${k}" stroke="url(#plGold)" stroke-width="4.4" color="#ffd766"/>` +
        `<use href="#plG${k}" stroke="#fff8e0" stroke-width="1.2" color="#fff8e0" opacity=".8"/></svg>` +
        '<i class="pl-gf"></i></div>';
    }

    /* Seeded, so every demo loop and every recording has the same embers. */
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let embers = '';
    for (let i = 0; i < 30; i++) {
      const size = 2 + rnd() * 5;
      embers += `<i style="--x:${f(8 + rnd() * 84)}%;--dx:${f((rnd() - 0.5) * 16)}vmin;--s:${f(size)}px;` +
        `--d:${f(5 + rnd() * 6)}s;--delay:${f(-rnd() * 11)}s;--o:${f(0.45 + rnd() * 0.55)}"></i>`;
    }

    const left = [], right = [];
    for (let k = 0; k < N; k++) (9 + 18 * k < 180 ? right : left).push(glyphEl(k));
    const ring = `<svg class="pl-stone" viewBox="0 0 1000 1000" aria-hidden="true"><use href="#plStone"/></svg>`;
    const C = f(C_GROOVE);
    let goldBeads = '';
    for (let i = 0; i < 32; i++) {
      const a = (i + 0.5) * 11.25 * Math.PI / 180;
      goldBeads += `<circle cx="${f(500 + 241 * Math.sin(a))}" cy="${f(500 - 241 * Math.cos(a))}" r="3.4"/>`;
    }

    root.innerHTML = DEFS +
      '<div class="pl-bg"></div><div class="pl-bloom"></div>' +
      `<div class="pl-embers" aria-hidden="true">${embers}</div>` +
      '<div class="pl-chrome" aria-hidden="true"><span class="pl-c tl"><b>CLUTCH</b><sup>®</sup></span><span class="pl-c tr">AK-47 · FIRE SERPENT</span>' +
      '<span class="pl-c bl">THE BRAVO COLLECTION</span><span class="pl-c br">EST. 2013 / CS2</span></div>' +
      '<div class="pl-layout"><div class="pl-axis" aria-hidden="true"></div>' +
      '<div class="pl-count" aria-hidden="true"><span class="pl-kicker">AWAKENING THE SERPENT</span>' +
      '<span class="pl-numwrap"><b class="pl-num">0</b><i>%</i></span></div>' +
      '<div class="pl-stage" aria-hidden="true"><div class="pl-halo"></div>' +
      `<div class="pl-side l">${ring}${left.join('')}</div>` +
      `<div class="pl-side r">${ring}${right.join('')}</div>` +
      `<svg class="pl-beads" viewBox="0 0 1000 1000"><g fill="#ffd766">${goldBeads}</g></svg>` +
      `<svg class="pl-arc" viewBox="0 0 1000 1000"><g transform="rotate(-90 500 500)" fill="none" stroke-dasharray="${C} ${C}" stroke-dashoffset="${C}">` +
      `<circle cx="500" cy="500" r="${R_GROOVE}" stroke="#ffb53d" stroke-width="34" opacity=".13"/>` +
      `<circle cx="500" cy="500" r="${R_GROOVE}" stroke="#ffc85a" stroke-width="18" opacity=".28"/>` +
      `<circle cx="500" cy="500" r="${R_GROOVE}" stroke="url(#plGoldR)" stroke-width="10"/>` +
      `<circle cx="500" cy="500" r="${R_GROOVE}" stroke="#fff7da" stroke-width="2.6" opacity=".9"/></g></svg>` +
      '<div class="pl-tip"><i></i></div>' +
      '<div class="pl-core"><div class="pl-core-glow"></div>' + emblem(false) +
      `<div class="pl-fill"><div class="pl-fill-in">${emblem(true)}</div></div>` +
      '<div class="pl-surface"><i></i></div>' +
      '<i class="pl-eye l"></i><i class="pl-eye r"></i></div>' +
      '<div class="pl-flash"></div></div>' +
      '<div class="pl-read" aria-hidden="true"><span class="pl-kicker">DAY SIGN <b class="pl-idx">00</b> / 20</span>' +
      '<span class="pl-day">—</span><span class="pl-sub">THE SACRED COUNT</span></div>' +
      '<div class="pl-title" aria-hidden="true"><span class="pl-t-kick">AK-47 <i></i> COVERT RIFLE</span>' +
      '<span class="pl-t-main">FIRE SERPENT</span><span class="pl-t-sub">SOME LEGENDS ARE FOUND. THIS ONE RISES.</span></div>' +
      '</div><div class="pl-wash"></div><div class="pl-veil"></div>';

    const $ = s => root.querySelector(s);
    const arc = $('.pl-arc g');
    const beadsEl = $('.pl-beads');
    const tip = $('.pl-tip');
    const fill = $('.pl-fill');
    const fillIn = $('.pl-fill-in');
    const surface = $('.pl-surface');
    const bloom = $('.pl-bloom');
    const halo = $('.pl-halo');
    const emb = $('.pl-embers');
    const numEl = $('.pl-num');
    const idxEl = $('.pl-idx');
    const dayEl = $('.pl-day');
    const glyphs = [...root.querySelectorAll('.pl-glyph')].sort((a, b) => a.dataset.k - b.dataset.k);

    let shown = -1;
    let lit = -1;
    let pct = -1;
    function render(p) {
      if (p === shown) return;
      shown = p;
      arc.style.strokeDashoffset = f(C_GROOVE * (1 - p));
      const hide = p <= 0.001 || p >= 0.999;
      tip.style.opacity = hide ? '0' : '1';
      tip.style.transform = `rotate(${f(p * 360)}deg)`;
      /* The emblem floods from below: the window rises, its content counter-moves. */
      const off = f((1 - p) * 100);
      fill.style.transform = `translate3d(0,${off}%,0)`;
      fillIn.style.transform = `translate3d(0,${-off}%,0)`;
      surface.style.transform = `translate3d(0,${off}%,0)`;
      surface.style.opacity = hide ? '0' : '1';
      beadsEl.style.opacity = f(Math.pow(p, 1.6));
      bloom.style.opacity = f(0.12 + 0.88 * p);
      halo.style.opacity = f(0.2 + 0.8 * p);
      emb.style.opacity = f(0.3 + 0.7 * p);
      const n = Math.floor(p * 100 + 1e-6);
      if (n !== pct) {
        pct = n;
        numEl.textContent = String(n);
        root.setAttribute('aria-valuenow', String(n));
      }
      const l = Math.min(N, Math.floor(p * N + 0.5 + 1e-6));   // glyph k lights at (k + .5) / 20
      if (l !== lit) {
        for (let k = 0; k < N; k++) glyphs[k].classList.toggle('on', k < l);
        if (l > 0) {
          idxEl.textContent = String(l).padStart(2, '0');
          dayEl.textContent = DAYS[l - 1];
          if (l > lit && !reduced) { dayEl.classList.remove('tick'); void dayEl.offsetWidth; dayEl.classList.add('tick'); }
        } else {
          idxEl.textContent = '00';
          dayEl.textContent = '—';
        }
        lit = l;
      }
    }
    render(0);

    return {
      ready: true,
      animates: false,
      minMs: 2200,
      render,
      frame() {},
      finish() {
        render(1);
        root.classList.add('is-complete');
        if (reduced) {
          if (DEMO) return after(1400, () => { root.classList.add('is-titled'); after(2200, restart); });
          after(250, () => leave(450));
          return;
        }
        after(380, () => root.classList.add('is-flash', 'is-open'));
        if (DEMO) {
          after(1250, () => root.classList.add('is-titled'));
          after(4600, restart);
        } else {
          after(950, () => leave(1100));
        }
      },
      reset() { shown = -1; render(0); }
    };
  }

  /* ================================================================ B ===
   * The door. A two-leaf basalt door with a carved calendar medallion on its
   * seam, drawn by one fragment shader over three baked maps
   * (scripts/preloader-b/: carve.js authors the carving, bake.js bakes):
   *   pl-stone.webp   photo stone with the carving baked in as relief
   *   pl-groove.webp  gold coverage of every carved channel (same pixels)
   *   pl-flow.webp    atlas: arrival time of the gold (coarse 8 bit + fine
   *                   triangle wave = ~13 bit), small and wide pre-blurred glow
   * Gold is wherever arrival < progress; the newest gold is white-hot and
   * cools to deep gold. At 100%: flare, rumble, dust, a line of light down
   * the seam, the leaves slide apart under a slow push-in, the page fades in.
   * No WebGL: the same maps on a 2D canvas with a radial reveal.
   */
  function variantB() {
    const ASSETS = {
      stone: 'assets/preloader/pl-stone.webp',
      groove: 'assets/preloader/pl-groove.webp',
      flow: 'assets/preloader/pl-flow.webp'
    };
    const FORCE_2D = params.get('gl') === '0';
    let DPR_CAP = 2;
    const slow = { last: 0, n: 0, over: 0 };
    const MED = 0.444;                     // medallion diameter, in door-texture units

    root.classList.add('pl-b');
    root.innerHTML =
      '<canvas class="plb-canvas" aria-hidden="true"></canvas>' +
      '<div class="plb-hud" aria-hidden="true">' +
      '<span class="plb-brand"><b>CLUTCH</b><sup>®</sup></span>' +
      '<span class="plb-meta">AK-47 · FIRE SERPENT</span>' +
      '<span class="plb-count"><span class="plb-kicker">UNSEALING</span>' +
      '<span class="plb-num"><b>0</b><i>%</i></span></span></div>' +
      '<div class="plb-veil"></div>' +
      '<div class="plb-title" aria-hidden="true"><span class="plb-t-kick">AK-47 <i></i> COVERT RIFLE</span>' +
      '<span class="plb-t-main">FIRE SERPENT</span><span class="plb-t-sub">SOME LEGENDS ARE FOUND. THIS ONE RISES.</span></div>';
    const canvas = root.querySelector('.plb-canvas');
    const canvasRef = { el: canvas };
    const hud = root.querySelector('.plb-hud');
    const numEl = root.querySelector('.plb-num b');
    const title = root.querySelector('.plb-title');
    const veil = root.querySelector('.plb-veil');

    const api = { ready: false, failed: false, animates: true, minMs: 3000 };
    let gl = null, ctx2d = null;
    let W = 0, H = 0, dpr = 1;
    let readyAt = -1;
    let doneAt = -1;               // clock time the fill completed
    let restartAt = -1;
    let pct = -1;
    let imgs = null;
    let lastLayout = '';
    const seed0 = 1;

    /* --------------------------------------------------------- layout */
    function place() {
      const M = Math.min(0.9 * W, 0.72 * H);
      let D = Math.max(M / MED, Math.max(W, H) * (W > H ? 1 : 0.92));
      const Dmax = Math.min(0.97 * W, 0.8 * H) / MED;
      D = Math.min(D, Math.max(Dmax, M / MED));
      return { cx: W / 2, cy: H * (W < H ? 0.48 : 0.5), D };
    }
    function resize() {
      const cv = canvasRef.el;
      const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight;
      dpr = Math.min(DPR_CAP, devicePixelRatio || 1);
      if (ctx2d) dpr = Math.min(dpr, 1.5);
      const key = `${w}x${h}@${dpr}`;
      if (key === lastLayout) return;
      lastLayout = key;
      W = w; H = h;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      if (gl) gl.viewport(0, 0, cv.width, cv.height);
    }

    /* ---------------------------------------------------------- shaders */
    const VS = `attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;
    const FS = `precision highp float;
uniform sampler2D uStone, uGroove, uFlow, uBack;
uniform vec2 uRes;
uniform vec3 uDoor;
uniform float uP, uT, uOpen, uSeam, uFlare, uIn, uInside, uDpr, uCalm, uFlood, uBackOn, uBurst;
uniform vec2 uBackFit;
const float PF = 16.0;
const vec3 WARM = vec3(1.0, 0.52, 0.16);

float arrival(vec2 q){
  q = clamp(q, 0.001, 0.999) * 0.5;
  float c = texture2D(uFlow, q).r * PF;
  float f = texture2D(uFlow, q + vec2(0.5, 0.0)).r;
  float n = floor(c);
  float a = f * 0.5, b = 1.0 - a;
  float best = n + a, bd = abs(best - c);
  float k = n + b, kd = abs(k - c); if (kd < bd) { best = k; bd = kd; }
  k = n - 1.0 + b; kd = abs(k - c); if (kd < bd) { best = k; bd = kd; }
  k = n + 1.0 + a; kd = abs(k - c); if (kd < bd) { best = k; }
  return best / PF;
}
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float h1(float i){ return fract(sin(i * 127.1) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float vnoise(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }

void main(){
  vec2 fc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 uv = (fc - uDoor.xy) / uDoor.z + 0.5;
  float px = 1.0 / uDoor.z;                                   // one device pixel in door units

  // the two leaves slide apart
  float covL = clamp((0.5 - uOpen - uv.x) / px + 0.5, 0.0, 1.0);
  float covR = clamp((uv.x - 0.5 - uOpen) / px + 0.5, 0.0, 1.0);
  float left = step(uv.x, 0.5);
  vec2 q = uv + vec2(left > 0.5 ? uOpen : -uOpen, 0.0);
  float leaf = left > 0.5 ? covL : covR;

  float flick = 1.0 + uCalm * (0.05 * sin(uT * 7.3) + 0.035 * sin(uT * 12.9 + 1.7) + 0.02 * sin(uT * 23.1));
  float edge = smoothstep(0.0, 0.04, q.x) * smoothstep(1.0, 0.96, q.x) * smoothstep(0.0, 0.04, q.y) * smoothstep(1.0, 0.96, q.y);

  // gold arrival and heat (e = time since the gold reached this pixel, in progress units)
  float t = arrival(q);
  float e = uP - t;
  float hot = exp(-max(e, 0.0) * 38.0) * step(0.0, e);
  float heat = max(hot, uFlare * 0.55 * step(0.0, e));

  // heat shimmer over fresh gold
  vec2 flowA = clamp(q, 0.001, 0.999) * 0.5;
  float gs = texture2D(uFlow, flowA + vec2(0.0, 0.5)).r;
  float gw = texture2D(uFlow, flowA + vec2(0.5, 0.5)).r;
  vec2 qs = q + uCalm * vec2(sin(q.y * 900.0 + uT * 9.0), cos(q.x * 700.0 - uT * 7.0)) * 0.00035 * gs * hot;

  vec3 st = texture2D(uStone, qs).rgb;
  st *= st;
  float stl = dot(st, vec3(0.3, 0.55, 0.15));
  float m = texture2D(uGroove, q).r;
  float mx = texture2D(uGroove, q + vec2(0.00049, 0.0)).r;
  float my = texture2D(uGroove, q + vec2(0.0, 0.00049)).r;

  // light on the stone: a faint cold shaft from above, warm light from the gold
  vec2 a = (uv - vec2(0.5, 0.18)) * vec2(1.5, 0.8);
  float shaft = 0.02 + 0.3 * exp(-dot(a, a) * 5.0);
  float lit = smoothstep(0.0, 0.02, e);
  float warmS = gs * gs * lit * (0.55 + 2.6 * heat);
  float warmW = gw * gw * smoothstep(0.0, 0.35, uP) * (0.35 + 1.4 * uFlare);
  vec3 light = vec3(0.62, 0.74, 0.78) * shaft + WARM * (warmS * 2.4 + warmW * 0.7) * flick;
  vec3 col = st * light * 1.5;

  // molten gold in the channels: emissive while hot, dark metal lit by its own glow once cool
  float fill = smoothstep(-0.0012, 0.0022, e);
  float cov = smoothstep(0.22, 0.72, m) * fill;
  vec3 n = normalize(vec3((m - mx) * 1.8, (m - my) * 1.8, 1.0));
  float diff = clamp(dot(n, normalize(vec3(-0.35, -0.55, 0.75))), 0.0, 1.0);
  float spec = pow(clamp(dot(n, normalize(vec3(-0.2, -0.35, 1.0))), 0.0, 1.0), 36.0);
  float rimN = 1.0 - n.z;
  float cool = smoothstep(0.02, 0.5, e);
  vec3 gMetal = mix(vec3(1.0, 0.6, 0.16), vec3(0.82, 0.47, 0.13), cool * 0.8);
  float grain = 0.7 + 4.0 * stl;
  float env = 0.5 + 0.5 * sin((uv.x * 0.8 + uv.y) * 6.0 + n.x * 4.0 - n.y * 4.0 - uT * 0.35);
  env = env * env;
  vec3 gold = gMetal * (0.07 + 0.72 * diff * env + 1.15 * rimN + 0.85 * gs * gs * lit) * grain * (0.5 + 1.2 * shaft + 0.8 * uFlare);
  gold += vec3(1.0, 0.86, 0.58) * spec * (0.6 + 1.5 * env) * (0.9 + 0.6 * (1.0 - cool));
  gold += vec3(0.9, 0.42, 0.1) * 0.07 * (0.6 + 0.4 * flick);
  vec3 molten = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.95, 0.8), heat * heat);
  gold += molten * (heat * 2.6 + 0.12 * (1.0 - cool)) * (0.7 + 0.3 * diff);
  float tip = smoothstep(-0.0012, 0.0005, e) * (1.0 - smoothstep(0.0005, 0.006, e));
  gold += vec3(1.0, 0.92, 0.75) * tip * 3.0;
  col = mix(col, gold * flick, cov);
  col *= edge;
  // bloom that bleeds onto the stone
  col += WARM * (gs * gs * lit * heat * 0.22 + warmW * warmW * 0.05) * flick * edge;

  // leaf edges: contact shadow and the rim the inner light catches
  float dEdge = left > 0.5 ? (0.5 - uOpen - uv.x) : (uv.x - 0.5 - uOpen);
  float dpx = max(dEdge, 0.0) * uDoor.z / uDpr;
  col *= 1.0 - 0.7 * exp(-dpx / 40.0) * smoothstep(0.0, 0.01, uOpen);
  col += vec3(1.0, 0.7, 0.38) * exp(-dpx / 2.5) * uInside * 1.4;
  col += WARM * st * exp(-max(dEdge, 0.0) * 14.0) * uInside * 1.4;

  // the line of light down the seam
  float sx = abs(uv.x - 0.5) * uDoor.z / uDpr;
  float along = 1.0 - smoothstep(uSeam * 0.62 - 0.08, uSeam * 0.62, abs(uv.y - 0.5));
  float seam = along * uSeam * (1.0 - smoothstep(0.0, 0.03, uOpen));
  col += vec3(1.0, 0.88, 0.62) * exp(-sx / 1.0) * seam * 3.0 + WARM * exp(-sx / 30.0) * seam * 0.5;

  // behind the door: a light source far inside, rays through the dust
  float gpx = abs(uv.x - 0.5) * uDoor.z / uDpr;
  vec2 d = uv - vec2(0.5, 0.47);
  float ang = atan(d.y, d.x);
  float rays = 0.8 + 0.2 * vnoise(ang * 14.0 + uT * 0.12) * vnoise(ang * 5.0 - uT * 0.08 + 4.0) - 0.08;
  float src = exp(-length(d * vec2(1.0, 0.5)) / (0.03 + 0.22 * uOpen));
  float core = exp(-gpx / (3.0 + 70.0 * uOpen));
  float haze = 0.55 * n2(uv * vec2(9.0, 4.0) + vec2(0.0, -uT * 0.25)) + 0.45 * n2(uv * vec2(23.0, 11.0) + vec2(uT * 0.1, -uT * 0.5));
  float fog = (0.35 + 0.65 * src) * (0.35 + 1.4 * haze * haze) * rays;
  vec3 lightIn = vec3(1.0, 0.9, 0.72) * (core * 2.2 + src * src * 2.0)
               + vec3(1.0, 0.5, 0.16) * fog * 0.95
               + vec3(0.02, 0.01, 0.005);
  // The burst: when the seam cracks the light floods out hot, then settles and
  // leaves the site's own first frame standing behind the door.
  vec3 litGap = lightIn * (0.25 + 0.75 * uInside) * (0.5 + 1.3 * uBurst);
  vec2 bu = (fc / uRes - 0.5) * uBackFit + 0.5;
  vec3 back = texture2D(uBack, clamp(bu, 0.001, 0.999)).rgb;
  back *= back;
  vec3 behind = back * (0.5 + 0.5 * uInside)
              + vec3(1.0, 0.62, 0.3) * (core * 0.7 + src * 0.18) * 0.42
              + lightIn * uBurst * 1.15;
  vec3 inside = mix(litGap, behind, uBackOn);
  col = mix(inside, col, leaf);
  // light spilling out of the gap, god-rays over the leaves and into the dust
  float spill = exp(-max(abs(uv.x - 0.5) - uOpen, 0.0) * 8.0) * rays;
  col += WARM * spill * uInside * 0.22 * mix(1.0 - leaf * 0.5, leaf * 0.7, uBackOn);
  col += WARM * spill * uBurst * (0.55 + 0.45 * mix(1.0, leaf, uBackOn));
  // the wide shaft of light across the frame at the peak
  col += vec3(1.0, 0.82, 0.55) * uBurst * uBurst * exp(-abs(uv.x - 0.5) * 6.0) * 0.8;
  col = col * (1.0 + 3.0 * uFlood) + vec3(1.0, 0.62, 0.3) * uFlood * 1.2;

  vec2 sv = (fc / uRes - 0.5) * vec2(uRes.x / uRes.y > 1.0 ? 1.1 : 1.3, 1.0);
  col *= 1.0 - 0.6 * dot(sv, sv) * (1.0 - uInside * 0.6);
  col *= uIn;
  col = 1.0 - exp(-col * 1.35);
  col = sqrt(col);
  col += (hash(fc + fract(uT * 13.0) * 97.0) - 0.5) * 0.022;
  gl_FragColor = vec4(col, 1.0);
}`;
    const PVS = `attribute vec4 aSeed;
attribute float aKind;
uniform vec2 uRes;
uniform vec3 uDoor;
uniform float uT, uP, uTc, uDpr, uIn, uOpen, uBurst;
varying vec3 vC;
varying float vA;
void main(){
  vec2 pos = vec2(-9.0);
  float size = 1.0;
  float a = 0.0;
  if (aKind < 0.5) {
    float tt = uT * (0.006 + 0.01 * aSeed.z);
    vec2 d = vec2(aSeed.x + sin(uT * 0.3 + aSeed.w * 30.0) * 0.015, fract(aSeed.y - tt));
    pos = d * uRes;
    size = (1.2 + 3.2 * aSeed.z * aSeed.z) * uDpr;
    a = (0.05 + 0.2 * uP) * smoothstep(0.0, 0.1, d.y) * smoothstep(1.0, 0.9, d.y);
    vC = mix(vec3(0.55, 0.7, 0.72), vec3(1.0, 0.72, 0.42), uP);
  } else if (aKind < 1.5) {
    float life = fract(uT * (0.1 + 0.12 * aSeed.z) + aSeed.w);
    float r = (0.03 + sqrt(aSeed.x) * 0.2) * 1.0;
    float ang = aSeed.y * 6.2832;
    vec2 d = vec2(cos(ang), sin(ang)) * r;
    d.y -= life * (0.08 + 0.18 * aSeed.z);
    d.x += sin(life * 8.0 + aSeed.w * 40.0) * 0.012;
    pos = uDoor.xy + d * uDoor.z;
    size = (1.6 + 2.6 * aSeed.z) * uDpr * (1.0 - 0.6 * life);
    a = smoothstep(0.0, 0.08, life) * (1.0 - life) * smoothstep(0.05, 0.5, uP) * 0.85 * step(r, uP * 0.26 + 0.02);
    vC = mix(vec3(1.0, 0.55, 0.15), vec3(1.0, 0.85, 0.55), aSeed.z);
  } else {
    float t0 = uTc - 0.1 - aSeed.w * 1.9;
    float g = 0.16 + 0.14 * aSeed.z;
    float y = -0.5 + aSeed.y * 0.55 + 0.5 * g * t0 * t0 + 0.02 * t0;
    float x = (aSeed.x - 0.5) * (0.012 + 0.04 * aSeed.z) + sign(aSeed.x - 0.5) * uOpen * 0.9 + sin(t0 * 3.0 + aSeed.w * 20.0) * 0.004;
    pos = uDoor.xy + vec2(x, y) * uDoor.z;
    size = (1.0 + 4.0 * aSeed.z * aSeed.z) * uDpr;
    a = step(0.0, t0) * smoothstep(0.0, 0.15, t0) * (1.0 - smoothstep(1.4, 2.6, t0)) * 0.75 * (1.0 + 2.2 * uBurst);
    vC = vec3(0.95, 0.8, 0.6);
  }
  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(size, 1.0);
  vA = a * uIn;
}`;
    const PFS = `precision mediump float;
varying vec3 vC;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float s = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(vC * s * vA, 1.0);
}`;

    /* --------------------------------------------------------- WebGL */
    let prog, pprog, quad, pbuf, U = {}, PU = {}, textures = [], NPART = 0;
    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    function link(vs, fs) {
      const pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      return pr;
    }
    function texture(img, unit, mip) {
      const tx = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (mip) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      } else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      }
      textures.push(tx);
      return tx;
    }
    function initGL() {
      const opts = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: MANUAL };
      gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
      if (!gl) return false;
      const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (!hp || hp.precision < 16) { gl = null; swapCanvas(); return false; }
      try {
        prog = link(VS, FS);
        pprog = link(PVS, PFS);
      } catch (err) {
        console.warn('[preloader] shader failed, using the 2D door', err);
        gl = null;
        swapCanvas();
        return false;
      }
      quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      for (const k of ['uStone', 'uGroove', 'uFlow', 'uRes', 'uDoor', 'uP', 'uT', 'uOpen', 'uSeam', 'uFlare', 'uIn', 'uInside', 'uDpr', 'uCalm', 'uFlood', 'uBack', 'uBackOn', 'uBackFit', 'uBurst']) U[k] = gl.getUniformLocation(prog, k);
      for (const k of ['uRes', 'uDoor', 'uT', 'uP', 'uTc', 'uDpr', 'uIn', 'uOpen', 'uBurst']) PU[k] = gl.getUniformLocation(pprog, k);
      // particles: motes, embers, dust from the seam
      const counts = reduced ? [0, 0, 0] : [70, 46, 110];
      NPART = counts[0] + counts[1] + counts[2];
      const data = new Float32Array(Math.max(1, NPART) * 5);
      let s = 1234567;
      const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
      let o = 0;
      counts.forEach((c, kind) => { for (let i = 0; i < c; i++) { data[o++] = r(); data[o++] = r(); data[o++] = r(); data[o++] = r(); data[o++] = kind; } });
      pbuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      canvas.addEventListener('webglcontextlost', e => {
        e.preventDefault();
        if (api.done) return;
        console.warn('[preloader] WebGL context lost, switching to the 2D door');
        gl = null;
        swapCanvas();
        init2D();
      });
      return true;
    }
    function uploadGL() {
      texture(imgs.stone, 0, true);
      texture(imgs.groove, 1, true);
      texture(imgs.flow, 2, false);
      gl.useProgram(prog);
      gl.uniform1i(U.uStone, 0);
      gl.uniform1i(U.uGroove, 1);
      gl.uniform1i(U.uFlow, 2);
      gl.uniform1i(U.uBack, 3);
      gl.uniform1f(U.uBackOn, 0);
      gl.uniform2f(U.uBackFit, 1, 1);
    }

    /* ----------------------------------------------------- choreography */
    const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
    const ease = v => { v = clamp01(v); return v * v * (3 - 2 * v); };
    const easeIO = v => { v = clamp01(v); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
    const easeIn = v => { v = clamp01(v); return v * v * v; };
    /* Everything below is a pure function of the clock, so a manual clock
       records the same film every time. */
    function state(t, p) {
      const s = { p, t: t / 1000, open: 0, seam: 0, flare: 0, inFade: 1, inside: 0, flood: 0, burst: 0, push: 1, sx: 0, sy: 0, tc: -1, hud: 1, veil: 0, title: 0 };
      s.inFade = readyAt < 0 ? 0 : ease((t - readyAt) / 900);
      s.hud = s.inFade;
      if (doneAt >= 0) {
        const tc = (t - doneAt) / 1000;
        s.tc = tc;
        if (reduced) {
          s.hud = 1 - ease(tc / 0.3);
        } else {
          s.flare = Math.min(1, tc / 0.18) * (1 - 0.75 * ease((tc - 0.2) / 0.7));
          s.seam = ease((tc - 0.3) / 0.7);
          const L0 = place();
          const halfVis = W / (2 * L0.D * 1.3);
          s.open = Math.min(0.3, 0.62 * halfVis) * easeIO((tc - 0.95) / 2.9);
          s.inside = ease((tc - 0.9) / 1.2);
          // a hot peak as the leaves part, then a quick settle
          s.burst = ease((tc - 0.78) / 0.4) * (1 - 0.9 * ease((tc - 1.15) / 0.85));
          s.flood = 0.26 * ease((tc - 0.95) / 0.3) * (1 - ease((tc - 1.25) / 0.7));
          s.push = 1 + 0.3 * easeIO((tc - 0.5) / 3.2);
          const amp = Math.min(1, tc / 0.25) * (1 - ease((tc - 0.9) / 1.2)) * Math.min(W, H) * 0.0032;
          s.sx = amp * (Math.sin(tc * 61) * 0.6 + Math.sin(tc * 97 + 1) * 0.4);
          s.sy = amp * (Math.sin(tc * 73 + 2) * 0.6 + Math.sin(tc * 131) * 0.4);
          s.hud = 1 - ease(tc / 0.5);
        }
        if (DEMO) {
          const T1 = reduced ? 1.2 : (backTex ? 3.9 : 3.3);
          s.veil = ease((tc - T1) / 0.55);
          s.title = ease((tc - T1 - 0.45) / 0.7) * (1 - ease((tc - T1 - 3.1) / 0.5));
        }
      }
      if (restartAt >= 0) s.veil = Math.max(s.veil, 1 - ease((t - restartAt) / 600));
      return s;
    }

    function drawGL(s) {
      const cw = canvas.width, ch = canvas.height;
      const L = place();
      const D = L.D * s.push * dpr;
      const cx = (L.cx + s.sx) * dpr, cy = (L.cy + s.sy) * dpr;
      gl.disable(gl.BLEND);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      const ap = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(ap);
      gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(U.uRes, cw, ch);
      gl.uniform3f(U.uDoor, cx, cy, D);
      gl.uniform1f(U.uP, s.p);
      gl.uniform1f(U.uT, s.t % 1000);
      gl.uniform1f(U.uOpen, s.open);
      gl.uniform1f(U.uSeam, s.seam);
      gl.uniform1f(U.uFlare, s.flare);
      gl.uniform1f(U.uIn, s.inFade);
      gl.uniform1f(U.uInside, s.inside);
      gl.uniform1f(U.uDpr, dpr);
      gl.uniform1f(U.uCalm, reduced ? 0 : 1);
      gl.uniform1f(U.uFlood, s.flood);
      gl.uniform1f(U.uBurst, s.burst);
      gl.uniform1f(U.uBackOn, backTex ? 1 : 0);
      if (backTex) {
        const ar = cw / ch, ba = backAspect;
        gl.uniform2f(U.uBackFit, ar > ba ? 1 : ba / ar, ar > ba ? ar / ba : 1);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(ap);
      if (!NPART) return;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(pprog);
      gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
      const as = gl.getAttribLocation(pprog, 'aSeed'), ak = gl.getAttribLocation(pprog, 'aKind');
      gl.enableVertexAttribArray(as);
      gl.enableVertexAttribArray(ak);
      gl.vertexAttribPointer(as, 4, gl.FLOAT, false, 20, 0);
      gl.vertexAttribPointer(ak, 1, gl.FLOAT, false, 20, 16);
      gl.uniform2f(PU.uRes, cw, ch);
      gl.uniform3f(PU.uDoor, cx, cy, D);
      gl.uniform1f(PU.uT, s.t % 1000);
      gl.uniform1f(PU.uP, s.p);
      gl.uniform1f(PU.uTc, s.tc);
      gl.uniform1f(PU.uDpr, dpr);
      gl.uniform1f(PU.uIn, s.inFade * (1 - s.inside * 0.5));
      gl.uniform1f(PU.uOpen, s.open);
      gl.uniform1f(PU.uBurst, s.burst);
      gl.drawArrays(gl.POINTS, 0, NPART);
      gl.disableVertexAttribArray(as);
      gl.disableVertexAttribArray(ak);
    }

    /* ------------------------------------------------ 2D fallback door */
    let goldLayer = null, glowLayer = null;
    function swapCanvas() {
      // a canvas that had a WebGL context cannot give a 2D one
      const fresh = canvas.cloneNode(false);
      canvas.replaceWith(fresh);
      canvasRef.el = fresh;
    }
    function init2D() {
      ctx2d = canvasRef.el.getContext('2d');
      lastLayout = '';
      if (imgs) build2D();
    }
    function build2D() {
      const S = 1024;
      const c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d');
      x.drawImage(imgs.groove, 0, 0, S, S);
      const im = x.getImageData(0, 0, S, S);
      const d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const m = d[i] / 255;
        const y = (i / 4 / S | 0) / S;
        d[i] = 222; d[i + 1] = 150 + 30 * (1 - y); d[i + 2] = 64 + 24 * (1 - y); d[i + 3] = Math.min(255, m * 300);
      }
      x.putImageData(im, 0, 0);
      goldLayer = c;
      const g = document.createElement('canvas'); g.width = g.height = 128;
      g.getContext('2d').drawImage(c, 0, 0, 128, 128);
      glowLayer = g;
    }
    function draw2D(s) {
      const cv = canvasRef.el;
      const x = ctx2d;
      const cw = cv.width, ch = cv.height;
      const L = place();
      const D = L.D * s.push * dpr;
      const cx = (L.cx + s.sx) * dpr, cy = (L.cy + s.sy) * dpr;
      const x0 = cx - D / 2, y0 = cy - D / 2;
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      x.fillStyle = '#060707';
      x.fillRect(0, 0, cw, ch);
      if (!goldLayer) return;
      const gap = s.open * D;
      if (s.burst > 0 || s.inside > 0) {
        const gr = x.createLinearGradient(cx - gap, 0, cx + gap, 0);
        gr.addColorStop(0, 'rgba(255,170,80,0.6)'); gr.addColorStop(0.5, 'rgba(255,236,200,1)'); gr.addColorStop(1, 'rgba(255,170,80,0.6)');
        x.fillStyle = gr;
        x.globalAlpha = Math.min(1, s.inside + s.burst * 0.8);
        x.fillRect(cx - gap, 0, gap * 2, ch);
        x.globalAlpha = 1;
      }
      const r = (0.012 + s.p * 0.72) * D;
      for (const side of [-1, 1]) {
        x.save();
        x.beginPath();
        if (side < 0) x.rect(0, 0, cx - gap, ch); else x.rect(cx + gap, 0, cw - cx - gap, ch);
        x.clip();
        x.translate(side * gap, 0);
        x.globalAlpha = s.inFade * 0.55;
        x.drawImage(imgs.stone, x0, y0, D, D);
        x.globalAlpha = s.inFade;
        x.save();
        x.beginPath();
        x.arc(cx, cy, r, 0, Math.PI * 2);
        x.clip();
        x.globalCompositeOperation = 'lighter';
        x.globalAlpha = s.inFade * (0.22 + 0.35 * s.flare);
        x.drawImage(glowLayer, x0, y0, D, D);
        x.globalCompositeOperation = 'source-over';
        x.globalAlpha = s.inFade;
        x.drawImage(goldLayer, x0, y0, D, D);
        x.restore();
        // the leading ring
        if (s.p > 0 && s.p < 1) {
          const rg = x.createRadialGradient(cx, cy, Math.max(0, r - D * 0.02), cx, cy, r);
          rg.addColorStop(0, 'rgba(255,200,110,0)'); rg.addColorStop(1, 'rgba(255,230,170,0.22)');
          x.fillStyle = rg;
          x.globalCompositeOperation = 'lighter';
          x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
        }
        x.restore();
      }
      if (s.seam > 0 && s.open < 0.002) {
        const h = s.seam * D * 0.62;
        const gr = x.createLinearGradient(cx - 30 * dpr, 0, cx + 30 * dpr, 0);
        gr.addColorStop(0, 'rgba(255,150,60,0)'); gr.addColorStop(0.5, 'rgba(255,240,210,0.95)'); gr.addColorStop(1, 'rgba(255,150,60,0)');
        x.fillStyle = gr;
        x.globalCompositeOperation = 'lighter';
        x.fillRect(cx - 30 * dpr, cy - h, 60 * dpr, h * 2);
        x.globalCompositeOperation = 'source-over';
      }
      const vg = x.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
      x.fillStyle = vg;
      x.fillRect(0, 0, cw, ch);
    }

    /* ------------------------------------------------------------ load */
    function load(src) {
      return new Promise((res, rej) => {
        const im = new Image();
        im.decoding = 'async';
        if ('fetchPriority' in im) im.fetchPriority = 'high';
        im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(im));
        im.onerror = () => rej(new Error('failed to load ' + src));
        im.src = src;
      });
    }
    const useGL = !FORCE_2D && initGL();
    if (!useGL) init2D();
    const loading = Promise.all([load(ASSETS.stone), load(ASSETS.groove), load(ASSETS.flow)]).then(([stone, groove, flow]) => {
      imgs = { stone, groove, flow };
      if (gl) uploadGL(); else build2D();
      resize();
      api.ready = true;
      readyAt = now();
    }, err => {
      console.warn('[preloader] door assets unavailable, using the calendar stone', err);
      api.failed = true;
    });

    /* The demo has no site behind it, so it borrows the first station's first
       frame (a dark liquid plate stands in if the clip cannot be decoded). */
    let backTex = null, backAspect = 16 / 9;
    function backPlate() {
      const c = document.createElement('canvas');
      c.width = 640; c.height = 360;
      const x = c.getContext('2d');
      const g = x.createRadialGradient(320, 160, 20, 320, 200, 460);
      g.addColorStop(0, '#182019'); g.addColorStop(0.55, '#0e1310'); g.addColorStop(1, '#060807');
      x.fillStyle = g; x.fillRect(0, 0, 640, 360);
      for (let i = 0; i < 2600; i++) {
        const v = Math.random();
        x.fillStyle = `rgba(${40 + v * 40},${50 + v * 45},${44 + v * 40},${0.02 + v * 0.05})`;
        x.fillRect(Math.random() * 640, Math.random() * 360, 1 + v * 2, 1 + v * 2);
      }
      return c;
    }
    /* the same grading the site lays over its stage (.stage-shade / .stage-edge),
       so the frame behind the door matches what the page shows a second later */
    function shade(x, w, h) {
      let g = x.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(8,10,8,.62)'); g.addColorStop(0.28, 'rgba(8,10,8,0)');
      g.addColorStop(0.6, 'rgba(8,10,8,.1)'); g.addColorStop(1, 'rgba(8,10,8,.78)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(8,10,8,.22)'); g.addColorStop(0.5, 'rgba(8,10,8,0)'); g.addColorStop(1, 'rgba(8,10,8,.32)');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      const r = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.62);
      r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.42)');
      x.fillStyle = r; x.fillRect(0, 0, w, h);
    }
    function firstFrame() {
      return new Promise(resolve => {
        const m = window.SEQUENCE_MANIFEST;
        const url = m && m.stations && m.stations[0] && m.stations[0].loop;
        if (!url || !gl) return resolve(null);
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
        const done = ok => { clearTimeout(timer); v.removeAttribute('src'); v.load(); resolve(ok); };
        const timer = setTimeout(() => done(null), 5000);
        v.addEventListener('seeked', () => {
          try {
            const c = document.createElement('canvas');
            c.width = 1024; c.height = Math.round(1024 * v.videoHeight / v.videoWidth) || 576;
            const x = c.getContext('2d');
            x.drawImage(v, 0, 0, c.width, c.height);
            shade(x, c.width, c.height);
            done(c);
          } catch (err) { done(null); }
        }, { once: true });
        v.addEventListener('error', () => done(null), { once: true });
        v.addEventListener('loadeddata', () => { try { v.currentTime = 0.05; } catch { done(null); } }, { once: true });
      });
    }

    let lastPct = -1;
    api.whenReady = DEMO ? loading.then(async () => {
      if (!gl) return;
      const frame = (await firstFrame()) || backPlate();
      backAspect = frame.width / frame.height;
      backTex = texture(frame, 3, false);
      gl.useProgram(prog);
      gl.uniform1i(U.uBack, 3);
    }) : loading;
    api.renderer = () => gl ? 'webgl' : ctx2d ? '2d' : 'none';
    api.render = p => {
      const n = Math.floor(p * 100 + 1e-6);
      if (n !== lastPct) {
        lastPct = n;
        numEl.textContent = String(n);
        root.setAttribute('aria-valuenow', String(n));
      }
    };
    api.frame = (t, p) => {
      if (!imgs) return;
      /* A GPU that cannot hold ~45 fps at this size gets fewer pixels, once. */
      if (!MANUAL && gl && DPR_CAP > 1.25 && !document.hidden) {
        const dt = t - slow.last;
        slow.last = t;
        if (dt > 0 && dt < 250) {
          slow.n++;
          if (dt > 22) slow.over++;
          if (slow.n >= 45) {
            if (slow.over > 22 && (devicePixelRatio || 1) > 1.25) { DPR_CAP = 1.25; lastLayout = ''; }
            slow.n = slow.over = 0;
          }
        }
      }
      resize();
      const s = state(t, p);
      if (gl) drawGL(s);
      else if (ctx2d) draw2D(s);
      canvasRef.el.style.opacity = '1';
      hud.style.opacity = String(s.hud);
      veil.style.opacity = String(s.veil);
      title.style.opacity = String(s.title);
      title.style.setProperty('--k', String(s.title));
    };
    api.finish = () => {
      api.render(1);
      doneAt = now();
      if (DEMO) {
        const T = reduced ? 1.2 : (backTex ? 3.9 : 3.3);
        after((T + 3.7) * 1000, restart);
        return;
      }
      if (reduced) after(250, () => leave(450));
      else after(1600, () => leave(1100));
    };
    api.reset = () => {
      doneAt = -1;
      restartAt = now();
      lastPct = -1;
      api.render(0);
    };
    api.destroy = () => {
      api.done = true;
      if (gl) {
        textures.forEach(tx => gl.deleteTexture(tx));
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
        gl = null;
      }
      imgs = null;
    };
    return api;
  }

  let V = VARIANT === 'a' ? variantA() : variantB();
  let MIN_MS = V.minMs;

  /* ------------------------------------------------------ real progress */

  const w = (v, s) => Math.min(1, Math.max(0, v));
  const clips = new Map();   // url -> { frac, at } for stall detection
  function plateFor(url) {
    if (!url) return null;
    for (const v of document.querySelectorAll('#stage video.plate')) if (v.dataset.clip === url) return v;
    return null;
  }
  function bufferedFrac(v) {
    if (!v || !(v.duration > 0)) return 0;
    let end = 0;
    const b = v.buffered;
    for (let i = 0; i < b.length; i++) if (b.start(i) <= 0.25) end = Math.max(end, b.end(i));
    return Math.min(1, end / v.duration);
  }
  /* 0..1 for one clip plus whether it counts as loaded. */
  function clipState(url, t, gate) {
    const v = plateFor(url);
    const frac = bufferedFrac(v);
    const rs = v ? v.readyState : 0;
    let rec = clips.get(url);
    if (!rec || frac > rec.frac + 0.001) { rec = { frac, at: t }; clips.set(url, rec); }
    const stalled = gate && t - Math.max(rec.at, gate) > STALL_MS;
    const done = rs >= 4 || frac >= 0.97 || stalled;
    return { value: done ? 1 : w(Math.max(frac, rs / 4 * 0.6)) * 0.96, done };
  }

  let fontsDone = false;
  let readyAt = 0;
  const markReady = () => { if (!readyAt) readyAt = now(); };
  if (!DEMO) {
    const fontLoads = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load('700 64px Antonio'), document.fonts.load('400 16px Archivo')])
      : Promise.resolve();
    fontLoads.then(() => { fontsDone = true; }, () => { fontsDone = true; });
    addEventListener('sequence:ready', markReady, { once: true });
  }

  function measure(t) {
    const seq = window.sequence;
    const stations = (seq && seq.stations) || [];
    const body = document.body;
    if (body.dataset.ready === '1') markReady();
    // sequence.js's no-manifest fallback marks the page ready without an event
    const bare = body.classList.contains('is-ready') && !stations.length;
    if (bare) markReady();
    const manifest = stations.length > 0 || bare;
    let loop = { value: 0, done: bare };
    let next = { value: 0, done: bare };
    if (stations.length) {
      const i = Math.max(0, Math.min(stations.length - 1, seq.station | 0));
      const st = stations[i];
      const after = stations[i + 1];
      const nextUrl = st.transitionOut || (after && after.loop !== st.loop ? after.loop : null);
      loop = clipState(st.loop, t, 0);
      loop.done = loop.done && !!readyAt;
      if (!readyAt) loop.value = Math.min(loop.value, 0.9);
      if (nextUrl) next = clipState(nextUrl, t, readyAt);
      else next = { value: 1, done: true };
      if (!readyAt) next.done = false;
    }
    const target = 0.08 * manifest + 0.07 * fontsDone + 0.45 * loop.value + 0.40 * next.value;
    const complete = manifest && fontsDone && !!readyAt && loop.done && next.done;
    return { target, complete };
  }

  /* --------------------------------------------------------- the clock */

  const DEMO_CURVE = [[0, 0], [0.1, 0.07], [0.28, 0.33], [0.44, 0.4], [0.6, 0.64], [0.78, 0.85], [0.92, 0.95], [1, 1]];
  function demoGoal(u) {
    if (u >= 1) return 1;
    for (let i = 1; i < DEMO_CURVE.length; i++) {
      const [x1, y1] = DEMO_CURVE[i];
      if (u <= x1) {
        const [x0, y0] = DEMO_CURVE[i - 1];
        const r = (u - x0) / (x1 - x0);
        return y0 + (y1 - y0) * (r * r * (3 - 2 * r));
      }
    }
    return 1;
  }

  let p = 0;
  let started = now();
  let last = started;
  let lastTarget = -1;
  let lastTargetAt = started;
  let raf = 0;
  let finished = false;
  let timedOut = false;
  let removed = false;
  let demoStart = -1;

  if (V.whenReady) {
    V.whenReady.then(() => {
      if (!V.failed || removed) return;
      if (V.destroy) V.destroy();
      V = variantA();                     // B's maps did not load: the calendar stone
      MIN_MS = V.minMs;
    });
  }

  function progress(t) {
    const dt = Math.min(64, Math.max(0, t - last));
    last = t;
    const elapsed = t - started;
    let goal;
    let complete;
    if (DEMO || FILM) {
      if (!V.ready) { demoStart = -1; return; }
      if (demoStart < 0) demoStart = t;
      goal = demoGoal((t - demoStart) / FILL_MS);
      complete = goal >= 1;
    } else {
      const m = measure(t);
      if (m.target > lastTarget + 0.002) { lastTarget = m.target; lastTargetAt = t; }
      complete = (m.complete && V.ready) || elapsed > MAX_MS;
      if (elapsed > MAX_MS && !(m.complete && V.ready) && !timedOut) {
        timedOut = true;
        console.warn('[preloader] hard timeout: revealing the site before the first clips finished buffering');
      }
      // A small lead that grows while we wait, so a slow link still looks alive.
      const lead = 0.07 * (1 - Math.exp(-(t - lastTargetAt) / 2500));
      goal = complete ? 1 : Math.min(0.97, m.target + lead);
      goal = Math.min(goal, elapsed / MIN_MS);
      if (!V.ready && !complete) goal = 0;
    }
    const k = 1 - Math.exp(-dt / (DEMO || FILM ? 140 : 260));
    let np = p + (goal - p) * k;
    np = Math.min(np, p + dt / (DEMO || FILM ? 700 : 900));        // glyphs light one by one, never in a burst
    if (complete) np = Math.max(np, Math.min(goal, p + dt / 3000));
    p = Math.max(p, Math.min(1, np));                       // never backwards
    if (complete && p > 0.9985) p = 1;
    V.render(p);
    if (p >= 1 && complete) finish();
  }

  function tick(t) {
    raf = 0;
    if (removed) return;
    if (!finished) progress(t);
    V.frame(t, p);
    if (MANUAL || document.hidden) return;
    if (!finished || V.animates) raf = requestAnimationFrame(tick);
  }
  function loop() { if (!raf && !MANUAL && !removed) raf = requestAnimationFrame(tick); }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; }
    else { last = now(); loop(); }
  });

  /* --------------------------------------------------------- the reveal */

  function finish() {
    if (finished) return;
    finished = true;
    V.finish();
  }

  function leave(fadeMs) {
    root.classList.add('is-leaving');
    root.style.setProperty('--pl-fade', fadeMs + 'ms');
    /* The leaves are parting: the masthead, rail and controls fade in under
       the door. The station copy does NOT come in here — it would land on top
       of the stone while the door is still on screen. `pl-hold` is lifted in
       the removal below, once the overlay is gone. */
    dispatchEvent(new CustomEvent('preloader:reveal', { detail: { fade: fadeMs, variant: V.animates ? 'b' : 'a', reduced } }));
    doc.classList.remove('pl-active');
    unblock();
    after(fadeMs, () => {
      removed = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (V.destroy) V.destroy();
      root.remove();
      /* The overlay is off the screen now. js/sequence.js starts station 1's
         entrance on this event (after a breath), so no hero type is ever
         drawn over the door; `pl-hold` comes off in the same frame, which is
         what releases the copy lines of every other station too. */
      dispatchEvent(new CustomEvent('preloader:done', { detail: { timedOut } }));
      doc.classList.remove('pl-hold');
    });
  }

  function restart() {
    if (V.animates) {                     // B: its own veil is drawn from the clock
      p = 0;
      V.reset();
      finished = false;
      started = last = now();
      demoStart = -1;
      loop();
      return;
    }
    root.classList.add('is-veiled');
    after(650, () => {
      root.classList.add('pl-reset');
      root.classList.remove('is-complete', 'is-flash', 'is-open', 'is-titled');
      p = 0;
      V.reset();
      void root.offsetWidth;
      root.classList.remove('pl-reset');
      finished = false;
      started = last = now();
      demoStart = -1;
      after(350, () => {
        root.classList.remove('is-veiled');
        loop();
      });
    });
  }

  /* ------------------------------------------------------ input blocking */

  const NAV_KEYS = new Set([' ', 'Spacebar', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab']);
  const inertTargets = [...document.querySelectorAll('body > :not(#preloader):not(script):not(noscript)')];
  let blocking = true;
  function block(event) {
    if (!blocking) return;
    const mod = event.metaKey || event.ctrlKey || event.altKey;
    if (event.type === 'keydown' || event.type === 'keyup') {
      if (mod) return;                                // reload, devtools, zoom stay native
      if (NAV_KEYS.has(event.key) || event.key.length === 1) event.preventDefault();
    } else if (event.cancelable && event.type !== 'touchstart') {
      event.preventDefault();
    }
    event.stopImmediatePropagation();
  }
  const BLOCKED = ['wheel', 'touchstart', 'touchmove', 'touchend', 'keydown', 'keyup'];
  BLOCKED.forEach(type => addEventListener(type, block, { capture: true, passive: false }));
  inertTargets.forEach(el => { el.inert = true; });
  doc.classList.add('pl-active');
  function unblock() {
    if (!blocking) return;
    blocking = false;
    BLOCKED.forEach(type => removeEventListener(type, block, { capture: true }));
    inertTargets.forEach(el => { el.inert = false; });
  }
  if (DEMO) BLOCKED.forEach(type => removeEventListener(type, block, { capture: true }));

  window.preloader = {
    get progress() { return p; },
    get done() { return finished; },
    get demo() { return DEMO; },
    get variant() { return V.animates ? 'b' : 'a'; },
    get renderer() { return V.renderer ? V.renderer() : 'svg'; },
    ready: V.whenReady || Promise.resolve(),
    /* manual clock only: advance time by ms and draw one frame */
    step(ms) {
      if (!MANUAL) return false;
      vnow += ms;
      runVirtualTimers();
      tick(vnow);
      return true;
    }
  };

  if (MANUAL) tick(vnow); else loop();
  /* Belt and braces: a tab throttled to zero frames still gets its site. */
  if (!DEMO && !FILM) after(MAX_MS + 4000, () => { if (!finished) { p = 1; finish(); } });
})();
