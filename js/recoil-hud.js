/* Fire Serpent — recoil HUD + FIRE control (station "recoil")
 * ---------------------------------------------------------------------------
 * Recoil idles on the L4 hold loop (the same clip as Signature). A FIRE button
 * (or F / Space / Enter while the station is active) asks the engine to play
 * the L4s burst once over it (window.sequence.fire(); manifest `fire`); the
 * engine hands back to the hold loop on the burst's last frame.
 *
 * A transparent instrument layer rides the footage. At rest only the card
 * shows. After FIRE (and on the one auto-fire):
 *   - a fast faint scan sweeps brackets over the five silhouettes; four stay
 *     as quiet dashed "shadow" brackets until the release, while a lock
 *     reticle spins two turns and shrinks onto TGT 02 (inner-left, the
 *     founder's pick: through the swing the barrel line runs almost at it),
 *     locking just after the aim settles, before the first shot; every round
 *     (staged hits) flashes it hot, kicks it, and counts HIT nn / DMG with a
 *     -36 tick;
 *   - an AIM ring on the reticle centre, riding a scaled copy of the measured
 *     kick, and a dashed bore line from the tracked front sight (the muzzle,
 *     per frame) to it, drawn in while LOCKING, faded on release;
 *   - a SPRAY CONTROL card: the AK-47 climb shot by shot, ammo, a PULL gauge
 *     that moves like a hand on a mouse (flick down after each shot, overshoot,
 *     settle, creep) and the mouse path it implies, and an idle snake that runs
 *     along the 30-round pattern.
 *
 * Everything shot-synced is a pure function of the burst clip's currentTime
 * against the station's manifest `hud` block (see its note), so a replay, a
 * paused tab or a cancelled burst cannot desync it. Idle geometry follows the
 * hold loop's currentTime. Only the snake and the after-glow keep a clock.
 *
 * Reduced motion: no snake, no auto-fire, no button choreography; FIRE still
 * plays the burst (the visitor asked for it) and the HUD follows it.
 * Only transform, opacity, line endpoints, points and stroke-dashoffset change.
 */
(() => {
  'use strict';

  const section = document.getElementById('recoil');
  if (!section) return;
  const $ = id => document.getElementById(id);
  const hud = section.querySelector('[data-hud]');
  const targetLayer = $('hudTargets');
  const aim = $('hudAim');
  const aimKick = aim.querySelector('.hud-aim-kick');
  const aimLabel = aim.querySelector('span');
  const bore = $('hudBore');
  const lead = $('hudLead');
  const plot = $('hudPlot');
  const ammoLabel = $('hudAmmo');
  const shotLabel = $('hudShot');
  const mag = $('hudMag');
  const pullFill = $('hudPull');
  const pullHead = $('hudPullHead');
  const pullVal = $('hudPullVal');
  const pullTrace = $('hudPullTrace');
  const fireButton = $('fireButton');
  const fireLabel = $('fireLabel');
  const fireHint = $('fireHint');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = matchMedia('(pointer: coarse)');
  const SVGNS = 'http://www.w3.org/2000/svg';

  /* The AK-47's 30-round spray, as the familiar shape: a near-vertical climb
     for the first nine rounds, a swing left, a long sweep right, then back.
     Units are arbitrary (x right, y up); it is drawn, not measured. */
  const PATTERN = [
    [0, 0], [0.4, 6], [1, 14], [-0.8, 24], [1.2, 35], [2, 46], [0.2, 56], [-2, 64], [-1, 70],
    [-6, 74], [-12, 76], [-18, 75], [-22, 78], [-20, 80], [-12, 79], [-4, 81], [5, 80],
    [14, 81], [22, 79], [28, 80], [31, 82], [27, 83], [20, 82], [14, 84], [8, 83], [4, 85],
    [-2, 84], [0, 86], [6, 85], [10, 86]
  ];
  const MAG = 30;
  const KICK_S = 0.3;      // aim kick ring life, seconds of video
  const DRAW_S = 0.09;     // one trajectory segment draws in this long
  const POP_S = 0.14;      // impact dot scale-in
  const SCAN0 = 0.15, SCAN_STEP = 0.09, SCAN_LIFE = 0.36;   // acquisition sweep over the five (clip s)
  const CONV0 = 0.62;      // lock reticle starts converging; it locks at lockAt + 0.1, before the first shot
  const LOCK_TURNS = 2;    // spins while it shrinks onto the locked target
  const DMG = 36;          // AK-47 per hit: 36 base, chest x1, unarmored (a range silhouette)
  const AIM_DROP = 0;      // px below the reticle centre
  const AIM_RIGHT = 0.19;  // aim point shift right, x silhouette height (~2/3 of the way to its right edge)
  const AIM_GAIN = 0.4;    // share of the measured kick the ring rides
  const SHADOW_OP = 0.26;  // the four unlocked shadow brackets during the sequence
  const GLOW_HOLD = 0.9;   // after the burst hands back: trace stays faint this long (s)
  const GLOW_FADE = 1.1;   // ...then clears over this long
  /* Idle snake: a head and a long fading tail (fractions of the pattern length),
     drawn as stacked dashes of one polyline. */
  const SNAKE_TAIL = [[0.05, 0.95, 1.9], [0.11, 0.62, 1.7], [0.19, 0.38, 1.5], [0.28, 0.2, 1.3], [0.38, 0.09, 1.1]]; // length, opacity, width
  const SNAKE_RUN = 3.4;   // seconds for the head to cover the whole pattern
  const SNAKE_REST = 0.35; // pause at the origin before the next pass

  let cfg = null, station = null;
  let loopEl = null;       // the hold loop plate
  let fireEl = null;       // the burst clip plate while it plays
  let mode = 'idle';       // idle | arming | firing
  let glowFrom = -1;       // performance.now() when a burst handed back
  let glowT = 0;           // clip time the after-glow freezes
  let raf = 0;
  let dots = [], segEnds = [], path = null, ticks = [], reticles = [], lock = null;
  let last = {};
  let snake = null, snakeSegs = [], snakeHead = null, snakeHalo = null;
  let ghostPts = [], ghostLen = [], ghostTotal = 1;
  let snakeClock = 0, snakeLevel = 1, prevNow = 0;
  let pullAmp = [], latAmp = [], latNorm = 1;
  let arrivedAt = 0, autoTimer = 0, pressed = false, autoDone = false;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = x => 1 - Math.pow(1 - clamp(x), 3);
  const phone = () => innerWidth <= 600;

  function el(name, attrs, parent) {
    const node = document.createElementNS(SVGNS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  }

  /* --------------------------------------------------------------- build */

  function build() {
    const shots = cfg.shots.length;
    /* viewBox 0 0 160 150: origin low and centred, 1 unit = 1.55 px. */
    const k = 1.55;
    const px = ([x, y]) => [80 + x * k, 138 - y * k];
    const pts = list => list.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
    el('path', { class: 'plot-axis', d: 'M80 4V148M8 138H152' }, plot);
    el('path', { class: 'plot-grid', d: 'M8 99.25H152M8 60.5H152M8 21.75H152M41.25 4V148M118.75 4V148' }, plot);
    el('circle', { class: 'plot-cone', cx: 80, cy: 138, r: 5 }, plot);
    el('circle', { class: 'plot-pulse', cx: 80, cy: 138, r: 5 }, plot);
    ghostPts = PATTERN.map(px);
    const ghost = el('g', { class: 'plot-ghost' }, plot);
    ghostPts.forEach(([x, y]) => el('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: 1.1 }, ghost));
    el('polyline', { class: 'plot-ghost-line', points: pts(ghostPts) }, plot);
    ghostLen = [0];
    for (let i = 1; i < ghostPts.length; i++) {
      ghostLen.push(ghostLen[i - 1] + Math.hypot(ghostPts[i][0] - ghostPts[i - 1][0], ghostPts[i][1] - ghostPts[i - 1][1]));
    }
    ghostTotal = ghostLen[ghostLen.length - 1];
    snake = el('g', { class: 'plot-snake' }, plot);
    snakeSegs = SNAKE_TAIL.slice().reverse().map(([f, op, w]) => {
      const len = f * ghostTotal;
      const s = el('polyline', { points: pts(ghostPts) }, snake);
      s.style.strokeDasharray = `${len.toFixed(1)} ${(ghostTotal * 2 + 60).toFixed(1)}`;
      s.style.strokeOpacity = op;
      s.style.strokeWidth = w;
      return { s, len };
    });
    snakeHalo = el('circle', { class: 'plot-snake-halo', r: 4.2 }, snake);
    snakeHead = el('circle', { class: 'plot-snake-head', r: 1.5 }, snake);
    const live = PATTERN.slice(0, shots).map(px);
    segEnds = [0];
    for (let i = 1; i < live.length; i++) {
      segEnds.push(segEnds[i - 1] + Math.hypot(live[i][0] - live[i - 1][0], live[i][1] - live[i - 1][1]));
    }
    path = el('polyline', { class: 'plot-live', points: pts(live) }, plot);
    const total = segEnds[segEnds.length - 1] || 1;
    path.style.strokeDasharray = `${total} ${total}`;
    path.style.strokeDashoffset = total;
    dots = live.map(([x, y], i) => {
      const g = el('g', { class: 'plot-hit', transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` }, plot);
      const c = el('circle', { r: 2.6 }, g);
      const n = el('text', { x: i % 2 ? -6 : 6, y: 1.5, 'text-anchor': i % 2 ? 'end' : 'start' }, g);
      n.textContent = String(i + 1).padStart(2, '0');
      c.style.transformBox = 'fill-box';
      return { g, c, n };
    });
    for (let i = 0; i < MAG; i++) { const t = document.createElement('i'); mag.appendChild(t); ticks.push(t); }

    /* Pull model: each shot asks for a downward pull equal to the pattern's
       vertical climb for that round (the first round lands on the aim point),
       and a lateral counter equal to the pattern's sideways step. */
    const top = PATTERN[shots - 1][1] || 1;
    for (let i = 0; i < shots; i++) {
      pullAmp.push(i ? (PATTERN[i][1] - PATTERN[i - 1][1]) / top : 0);
      latAmp.push(i ? -(PATTERN[i][0] - PATTERN[i - 1][0]) : 0);
    }
    let lat = 0, m = 1;
    latAmp.forEach(v => { lat += v; m = Math.max(m, Math.abs(lat)); });
    latNorm = m;

    /* Five scan brackets (one per silhouette, shown only during the
       acquisition sweep) and one lock reticle that converges on the locked target (TGT 02). */
    const BR = '<path d="M-44 -26v-18h18M26 -44h18v18M44 26v18h-18M-26 44h-18v-18"/>';
    cfg.targets.forEach((p, i) => {
      const r = document.createElement('div');
      r.className = 'hud-reticle hud-reticle--scan';
      r.innerHTML = `<svg class="hud-brackets" viewBox="-50 -50 100 100">${BR}</svg><span class="hud-tag"><b>TGT ${String(i + 1).padStart(2, '0')}</b></span>`;
      targetLayer.appendChild(r);
      reticles.push({ node: r, lab: r.querySelector('.hud-tag b'), p, h: cfg.targetH[i] });
    });
    const L = document.createElement('div');
    L.className = 'hud-reticle hud-reticle--lock';
    L.innerHTML = `<svg class="hud-brackets" viewBox="-50 -50 100 100">${BR}` +
      '<circle class="hud-lock-ring" r="31" pathLength="100"/>' +
      '<path class="hud-lock-ticks" d="M0 -38v-8M0 38v8M-38 0h-8M38 0h8"/>' +
      '<path class="hud-pip" d="M0 -8v-6M0 8v6M-8 0h-6M8 0h6"/></svg>' +
      `<span class="hud-tag"><b>TGT ${String(cfg.lockTarget + 1).padStart(2, '0')}</b><span>LOCKING</span></span>` + '<i class="hud-dmg">-36</i>';
    targetLayer.appendChild(L);
    lock = { node: L, svg: L.querySelector('svg'), lab: L.querySelector('.hud-tag b'), state: L.querySelector('.hud-tag span'), dmg: L.querySelector('.hud-dmg'),
             p: cfg.targets[cfg.lockTarget], h: cfg.targetH[cfg.lockTarget] };
  }

  /* ---------------------------------------------------------- geometry */

  function toScreen(u, v, video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return null;
    const W = innerWidth, H = innerHeight;
    const s = Math.max(W / vw, H / vh);
    const dw = vw * s, dh = vh * s;
    const f = station.focal || { x: 50, y: 50 };
    return { x: (W - dw) * f.x / 100 + u / 100 * dw, y: (H - dh) * f.y / 100 + v / 100 * dh, h: dh };
  }

  function keyAt(list, t) {
    if (t <= list[0][0]) return list[0].slice(1);
    for (let i = 1; i < list.length; i++) {
      if (t <= list[i][0]) {
        const a = list[i - 1], b = list[i];
        const r = (t - a[0]) / ((b[0] - a[0]) || 1);
        return a.slice(1).map((v, j) => v + (b[j + 1] - v) * r);
      }
    }
    return list[list.length - 1].slice(1);
  }

  /* A hand's response to one shot, 0 -> ~1: a fast flick (critically short,
     slightly under-damped spring: ~70 ms to the first peak, ~10% overshoot,
     relax) blended with a slow creep that keeps the hand moving between shots. */
  function hand(tau) {
    if (tau <= 0) return 0;
    const wn = 30, z = 0.58, wd = wn * Math.sqrt(1 - z * z);
    const spring = 1 - Math.exp(-z * wn * tau) * (Math.cos(wd * tau) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * tau));
    const creep = 1 - Math.exp(-tau / 0.32);
    return 0.72 * spring + 0.28 * creep;
  }
  /* Recoil control as a function of burst-clip time: [pull 0..~1, lateral -1..1]. */
  function control(t) {
    let p = 0, l = 0;
    const shots = cfg.shots;
    for (let i = 1; i < shots.length && t > shots[i]; i++) {
      const r = hand(t - shots[i]);
      p += pullAmp[i] * r; l += latAmp[i] * r;
    }
    const back = t > cfg.releaseAt ? 1 - ease((t - cfg.releaseAt) / 0.7) : 1;
    return [p * back, (l / latNorm) * back];
  }

  /* -------------------------------------------------------------- render */

  function set(key, value, write) {
    if (last[key] === value) return;
    last[key] = value;
    write(value);
  }

  function line(node, key, x1, y1, x2, y2, op) {
    set(key, `${x1.toFixed(1)} ${y1.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)} ${op.toFixed(3)}`, () => {
      node.setAttribute('x1', x1.toFixed(1)); node.setAttribute('y1', y1.toFixed(1));
      node.setAttribute('x2', x2.toFixed(1)); node.setAttribute('y2', y2.toFixed(1));
      node.style.opacity = op.toFixed(3);
    });
  }

  /* t = burst clip time (null when idle); glow = 0..1 after-glow of the last burst. */
  function render(t, glow) {
    const firing = t != null;
    const video = firing ? fireEl : loopEl;
    if (!video || !video.videoWidth) return;
    const shots = cfg.shots;
    const tt = firing ? t : glow > 0 ? glowT : -1;   // time the plot shows
    const fired = tt < 0 ? 0 : shots.filter(s => tt >= s).length;

    /* targets: nothing at rest. After FIRE: a fast faint scan over the five,
       then a lock reticle spins down onto TGT 02 and locks as the aim settles;
       every hit flashes, shakes and counts damage; all of it leaves with the
       swing back. Pure functions of the burst clip's time. */
    const still = reduced.matches;
    const small = phone();
    const T = firing ? t : -1;
    reticles.forEach((r, i) => {
      const s = toScreen(r.p[0], r.p[1], video);
      if (!s) return;
      const q = (T - (SCAN0 + i * SCAN_STEP)) / SCAN_LIFE;
      const isLock = i === cfg.lockTarget;
      const endFade = T >= cfg.releaseAt ? 1 - ease((T - cfg.releaseAt) / 0.55) : 1;
      const shadow = !isLock && q >= 0.5 && T < cfg.releaseAt + 0.55;   // quiet shadow bracket after its sweep
      const on = (q > 0 && q < 1) || shadow;
      const sweep = q > 0 && q < 1 ? Math.sin(Math.PI * Math.min(q, isLock ? 1 : 0.5)) * 0.6 : 0;
      const op = !on ? 0 : still ? (isLock ? 0 : SHADOW_OP) : shadow ? Math.max(SHADOW_OP, sweep) * endFade : sweep;
      const size = Math.round(s.h * r.h / 100 * 1.35);
      set('rs' + i, size, v => r.node.style.setProperty('--rs', v + 'px'));
      set('ro' + i, op.toFixed(3), v => { r.node.style.opacity = v; });
      if (on) r.node.style.transform = `translate3d(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px,0) scale(${(still ? 1 : 1.3 - 0.3 * ease(Math.max(0, q) * 1.6)).toFixed(3)})`;
      set('lab' + i, small, v => { r.lab.textContent = v ? String(i + 1).padStart(2, '0') : `TGT ${String(i + 1).padStart(2, '0')}`; });
    });

    const conv1 = cfg.lockAt + 0.1;
    const off = cfg.releaseAt + 0.55;
    let lOp = 0, lScale = 1, lRot = 0, state = '', hitMix = 0, shake = 0, lockP = 0;
    if (T >= CONV0 && T < off) {
      if (T < conv1) {
        const q = (T - CONV0) / (conv1 - CONV0), e = ease(q);
        lOp = still ? (T >= cfg.lockAt ? 1 : 0) : Math.min(1, q * 4);
        lScale = still ? 1 : 2.9 - 1.9 * e;
        lRot = still ? 0 : -LOCK_TURNS * 360 * (1 - e);
        state = `LOCKING ${String(Math.min(99, Math.floor(q * 12) * 9)).padStart(2, '0')}%`;
      } else if (T < cfg.releaseAt) {
        const q = T - conv1;
        lOp = 1; state = fired ? `LOCKED · DMG ${DMG * fired}` : 'LOCKED'; lockP = ease(q / 0.3);
        if (!still && q < 0.2) lScale = 1 + 0.16 * (1 - q / 0.2);   // the lock beat
      } else {
        const q = ease((T - cfg.releaseAt) / 0.55);
        lOp = 1 - q; lScale = still ? 1 : 1 + 0.35 * q; state = 'RELEASED';
      }
      // damage: the latest hit flashes the reticle, kicks it and counts
      if (fired && T < cfg.releaseAt) {
        const since = T - shots[fired - 1];
        if (since < 0.32) {
          hitMix = 1 - since / 0.32;
          if (!still) {
            shake = Math.max(0, 1 - since / 0.2);
            lScale *= 1 + 0.14 * shake;
          }
        }
      }
    }
    let lockScr = null, lockSize = 0;
    {
      const s = toScreen(lock.p[0], lock.p[1], video);
      const size = Math.round(s.h * lock.h / 100 * 1.9);
      set('lrs', size, v => lock.node.style.setProperty('--rs', v + 'px'));
      const jx = shake ? Math.sin(T * 173) * 5 * shake : 0, jy = shake ? Math.cos(T * 151) * 3 * shake : 0;
      lock.node.style.transform = `translate3d(${(s.x + jx).toFixed(1)}px,${(s.y + jy).toFixed(1)}px,0)`;
      lock.svg.style.transform = `rotate(${lRot.toFixed(1)}deg) scale(${lScale.toFixed(3)})`;
      set('lop', lOp.toFixed(3), v => { lock.node.style.opacity = v; });
      set('lhit', hitMix.toFixed(2), v => { lock.node.style.setProperty('--hit', v); });
      set('lstate', state, v => { lock.state.textContent = v; lock.node.dataset.state = v.split(' ')[0].toLowerCase(); });
      const id = String(cfg.lockTarget + 1).padStart(2, '0');
      const lab = fired && T < cfg.releaseAt ? `${small ? id : 'TGT ' + id} · HIT ${String(fired).padStart(2, '0')}` : small ? id : 'TGT ' + id;
      set('llab', lab, v => { lock.lab.textContent = v; });
      // floating damage number for the latest hit
      const since = fired ? T - shots[fired - 1] : Infinity;
      const dq = since / 0.7;
      set('dmgtxt', fired, v => { lock.dmg.textContent = v ? `−${DMG}` : ''; });
      set('dmg', dq < 1 && T < cfg.releaseAt ? dq.toFixed(3) : 'x', v => {
        if (v === 'x') { lock.dmg.style.opacity = '0'; return; }
        lock.dmg.style.opacity = (1 - ease(+v)).toFixed(3);
        lock.dmg.style.transform = `translate3d(0,${(-26 * ease(+v)).toFixed(1)}px,0)`;
      });
      lockScr = s; lockSize = size * lScale;
    }

    /* aim ring: hidden at rest. While firing it sits on the locked reticle's
       centre (TGT 02) and rides a scaled copy of the measured aim-point kick.
       The bore line runs from the front sight (tracked per frame, so it stays
       on the muzzle through every kick) to the ring; it draws itself in while
       LOCKING and fades on release. */
    let aOp = 0;
    const settled = keyAt(cfg.sight, cfg.lockAt + 0.3);
    if (firing && t >= cfg.aimAt && t < cfg.restAt) {
      const [sax, say, sfx, sfy] = keyAt(cfg.sight, t);
      aOp = t < conv1 ? ease((t - cfg.aimAt) / (conv1 - cfg.aimAt))
        : t < cfg.releaseAt ? 1 : 1 - ease((t - cfg.releaseAt) / 0.55);
      const du = toScreen(sax, say, video), d0 = toScreen(settled[0], settled[1], video);
      const jx = shake ? Math.sin(T * 173) * 5 * shake : 0;
      // aim point: inside the silhouette, towards its right edge (not dead centre)
      const shift = lockScr.h * lock.h / 100 * AIM_RIGHT;
      const Ax = lockScr.x + shift + (du.x - d0.x) * AIM_GAIN + jx, Ay = lockScr.y + AIM_DROP + (du.y - d0.y) * AIM_GAIN;
      aim.style.transform = `translate3d(${Ax.toFixed(1)}px,${Ay.toFixed(1)}px,0)`;
      const Fs = toScreen(sfx, sfy, video);
      const draw = still ? 1 : ease((t - CONV0) / (conv1 - CONV0));
      const dx = Ax - Fs.x, dy = Ay - Fs.y, d = Math.hypot(dx, dy) || 1;
      const x1 = Fs.x + dx / d * 7, y1 = Fs.y + dy / d * 7;
      const reach = Math.max(0, d - 17) * draw;
      line(bore, 'bore', x1, y1, x1 + dx / d * reach, y1 + dy / d * reach, d > 30 && draw > 0 ? aOp * 0.85 : 0);
    } else line(bore, 'bore', 0, 0, 0, 0, 0);
    set('aop', aOp.toFixed(3), v => { aim.style.opacity = v; });
    set('aimlab', 'AIM', v => { aimLabel.textContent = v; });
    line(lead, 'lead', 0, 0, 0, 0, 0);
    const since = firing && fired ? t - shots[fired - 1] : Infinity;
    const kickP = since < KICK_S ? since / KICK_S : 1;
    const kOp = since < KICK_S && aOp > 0 ? 1 - kickP : 0;
    set('kick', kOp.toFixed(3), v => {
      aimKick.style.opacity = v;
      aimKick.style.transform = `scale(${(0.5 + 0.9 * kickP).toFixed(3)})`;
    });

    /* spray plot -------------------------------------------------------- */
    const fade = firing ? 1 : glow;
    set('livefade', fade.toFixed(3), v => { plot.style.setProperty('--live', v); });
    const shown = fade > 0.001 ? fired : 0;
    let drawn = 0;
    if (shown > 1) {
      const segP = firing ? clamp((tt - shots[shown - 1]) / DRAW_S) : 1;
      drawn = segEnds[shown - 2] + (segEnds[shown - 1] - segEnds[shown - 2]) * segP;
    }
    const total = segEnds[segEnds.length - 1] || 1;
    set('dash', drawn.toFixed(2), () => { path.style.strokeDashoffset = (total - drawn).toFixed(2); });
    dots.forEach((dd, i) => {
      const on = i < shown;
      const p = on ? (firing ? ease((tt - shots[i]) / POP_S) : 1) : 0;
      set('dot' + i, `${p.toFixed(3)}|${fade.toFixed(3)}`, () => {
        dd.c.style.transform = `scale(${(on ? 0.4 + 0.6 * p : 0).toFixed(3)})`;
        dd.g.style.opacity = on ? (Math.min(1, p * 1.5) * fade).toFixed(3) : '0';
      });
      set('dotlast' + i, on && i === shown - 1, v => dd.g.classList.toggle('is-last', v));
    });

    /* pull gauge: the hand on the mouse, continuous ---------------------- */
    const [pull, lat] = firing ? control(t) : [0, 0];
    const pv = Math.max(0, pull);
    set('pull', pv.toFixed(3), v => {
      pullFill.style.transform = `scaleY(${Math.min(1.08, v)})`;
      pullHead.style.transform = `translateY(${(Math.min(1.08, v) * 100).toFixed(1)}%)`;
      pullHead.style.opacity = v > 0.01 ? '1' : '0';
    });
    set('pullval', Math.round(pv * 100), v => { pullVal.textContent = `${String(Math.min(99, v)).padStart(2, '0')}%`; });
    if (firing && t > shots[0] - 0.05) {
      const t0 = shots[0] - 0.05, n = 36, pts = [];
      for (let j = 0; j <= n; j++) {
        const tj = t0 + (t - t0) * j / n;
        const [p, l] = control(tj);
        pts.push(`${(5 + l * 4).toFixed(2)},${(Math.max(0, p) * 100).toFixed(2)}`);
      }
      pullTrace.setAttribute('points', pts.join(' '));
      set('traceop', t > cfg.releaseAt ? (1 - ease((t - cfg.releaseAt) / 0.7)).toFixed(3) : '1', v => { pullTrace.style.opacity = v; });
    } else set('traceop', '0', v => { pullTrace.style.opacity = v; });

    /* readout ----------------------------------------------------------- */
    const n = firing ? fired : 0;
    set('ammo', MAG - n, v => { ammoLabel.textContent = String(v).padStart(2, '0'); });
    set('ticks', n, v => ticks.forEach((tick, i) => tick.classList.toggle('spent', i >= MAG - v)));
    let msg = 'READY';
    if (firing) {
      if (t < cfg.aimAt) msg = 'READY';
      else if (!fired) msg = t < cfg.lockAt + 0.1 ? 'ACQUIRING' : `LOCKED · TGT ${String(cfg.lockTarget + 1).padStart(2, '0')}`;
      else if (t < cfg.releaseAt) msg = `SHOT ${String(fired).padStart(2, '0')} · ${shots[fired - 1].toFixed(2)} S`;
      else msg = `${fired} FIRED · ${MAG - fired} LEFT`;
    } else if (mode === 'arming') msg = 'ARMING';
    set('msg', msg, v => { shotLabel.textContent = v; });
  }

  /* --------------------------------------------------------- idle snake */

  function pointAt(len) {
    let i = 1;
    while (i < ghostLen.length - 1 && ghostLen[i] < len) i++;
    const a = ghostPts[i - 1], b = ghostPts[i];
    const r = clamp((len - ghostLen[i - 1]) / ((ghostLen[i] - ghostLen[i - 1]) || 1));
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r];
  }

  function renderSnake(now, target) {
    const dt = prevNow ? Math.min(0.05, (now - prevNow) / 1000) : 0;
    prevNow = now;
    snakeClock += dt;
    snakeLevel += (target - snakeLevel) * (1 - Math.exp(-dt / 0.2));
    const maxTail = SNAKE_TAIL[SNAKE_TAIL.length - 1][0] * ghostTotal;
    const speed = ghostTotal / SNAKE_RUN;
    const cycle = (ghostTotal + maxTail) / speed + SNAKE_REST;
    const head = ((snakeClock % cycle) - SNAKE_REST) * speed;
    snakeSegs.forEach(({ s, len }) => { s.style.strokeDashoffset = (-(Math.min(head, ghostTotal + len) - len)).toFixed(2); });
    const on = head >= 0 && head <= ghostTotal;
    const [x, y] = pointAt(clamp(head, 0, ghostTotal));
    const hOp = on ? Math.min(1, head / 6, (ghostTotal - head) / 10 + 0.15) : 0;
    snakeHead.setAttribute('cx', x.toFixed(2)); snakeHead.setAttribute('cy', y.toFixed(2));
    snakeHalo.setAttribute('cx', x.toFixed(2)); snakeHalo.setAttribute('cy', y.toFixed(2));
    set('snakeHead', hOp.toFixed(2), v => { snakeHead.style.opacity = v; snakeHalo.style.opacity = (v * 0.22).toFixed(3); });
    set('snakeLevel', snakeLevel.toFixed(3), v => { snake.style.opacity = v; });
  }

  /* ------------------------------------------------------ FIRE control */

  const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/_';
  let scrambleRaf = 0;
  function scramble(to, ms) {
    cancelAnimationFrame(scrambleRaf);
    if (reduced.matches || !ms) { fireLabel.textContent = to; return; }
    const from = fireLabel.textContent, t0 = performance.now(), len = Math.max(from.length, to.length);
    const tick = now => {
      const p = clamp((now - t0) / ms);
      let out = '';
      for (let i = 0; i < len; i++) {
        const settle = (i + 1) / len;
        out += p >= settle ? (to[i] || '') : p > settle - 0.45 ? SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0] : (from[i] || '');
      }
      fireLabel.textContent = out.trimEnd();
      if (p < 1) scrambleRaf = requestAnimationFrame(tick);
      else fireLabel.textContent = to;
    };
    scrambleRaf = requestAnimationFrame(tick);
  }

  function buttonOut() {
    fireButton.setAttribute('aria-disabled', 'true');
    fireButton.classList.remove('is-in');
    fireButton.classList.add('is-out');
    fireHint.classList.add('is-out');
    scramble('FIRING', 260);
  }
  function buttonIn() {
    fireButton.removeAttribute('aria-disabled');
    fireButton.classList.remove('is-out');
    fireLabel.textContent = 'FIRING';
    void fireButton.offsetWidth;
    fireButton.classList.add('is-in');
    fireHint.classList.remove('is-out');
    scramble('FIRE', 420);
  }

  function requestFire(source) {
    if (!cfg || !section.classList.contains('is-active') || mode !== 'idle') return;
    if (!window.sequence || window.sequence.busy || window.sequence.firing) return;
    if (source !== 'auto') pressed = true;
    clearTimeout(autoTimer);
    window.sequence.fire();
  }

  function onFireEvent(e) {
    const { phase, el: clip, station: id } = e.detail;
    if (id !== 'recoil') return;
    if (phase === 'arming') { mode = 'arming'; fireEl = clip; glowFrom = -1; buttonOut(); }
    else if (phase === 'firing') { mode = 'firing'; fireEl = clip; }
    else {
      // done or cancelled: hand back to idle, keep the trace a moment
      if (mode === 'firing' && fireEl) { glowT = phase === 'done' ? (fireEl.duration || 8) : Math.max(0, fireEl.currentTime); glowFrom = performance.now(); }
      mode = 'idle';
      fireEl = null;
      if (phase === 'cancelled' && !section.classList.contains('is-active')) glowFrom = -1;
      buttonIn();
    }
    start();
  }

  function armAuto() {
    clearTimeout(autoTimer);
    if (autoDone || pressed || !cfg || reduced.matches || !station.fire || !(station.fire.autoFireMs > 0)) return;
    autoTimer = setTimeout(() => {
      if (pressed || autoDone || !section.classList.contains('is-active')) return;
      autoDone = true;
      requestFire('auto');
    }, station.fire.autoFireMs);
  }

  /* ---------------------------------------------------------- lifecycle */

  function findLoop() {
    const v = document.querySelector(`.plate[data-clip="${CSS.escape(station.loop)}"]`);
    return v && v.readyState >= 1 ? v : null;
  }

  function frame(now) {
    raf = 0;
    if (!section.classList.contains('is-active') || document.hidden) { prevNow = 0; return; }
    loopEl = findLoop() || loopEl;
    const firing = mode === 'firing' && fireEl && fireEl.isConnected;
    let glow = 0;
    if (!firing && glowFrom >= 0) {
      const age = (now - glowFrom) / 1000;
      glow = age < GLOW_HOLD ? 0.4 : 0.4 * (1 - ease((age - GLOW_HOLD) / GLOW_FADE));
      if (glow <= 0.001) { glow = 0; glowFrom = -1; }
    }
    render(firing ? fireEl.currentTime : null, glow);
    if (reduced.matches) {
      if (firing || glowFrom >= 0) raf = requestAnimationFrame(frame);
      return;
    }
    const t = firing ? fireEl.currentTime : null;
    const sh = cfg.shots;
    const level = t == null ? (mode === 'arming' ? 0.5 : 1) : t >= sh[0] - 0.3 && t < sh[sh.length - 1] + 0.4 ? 0.12 : t < cfg.restAt ? 0.4 : 0.8;
    renderSnake(now, level);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (!cfg || raf) return;
    last = {};
    prevNow = 0;
    raf = requestAnimationFrame(frame);
  }

  function init() {
    if (cfg) return;
    const list = window.sequence && window.sequence.stations;
    station = list && list.find(s => s.id === 'recoil');
    if (!station || !station.hud) return;
    cfg = station.hud;
    build();
    hud.classList.add('is-built');
    fireHint.textContent = coarse.matches ? 'TAP TO FIRE A BURST' : 'PRESS F · OR CLICK TO FIRE';
    fireButton.addEventListener('click', () => { if (fireButton.getAttribute('aria-disabled') !== 'true') requestFire('button'); });
    addEventListener('sequence:fire-request', () => requestFire('key'));
    addEventListener('sequence:fire', onFireEvent);
    new MutationObserver(() => {
      if (section.classList.contains('is-active')) {
        if (!arrivedAt) arrivedAt = performance.now();
        armAuto();
        start();
      } else clearTimeout(autoTimer);
    }).observe(section, { attributes: true, attributeFilter: ['class'] });
    reduced.addEventListener('change', () => { last = {}; start(); });
    addEventListener('resize', () => { last = {}; start(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && section.classList.contains('is-active')) start(); });
    if (section.classList.contains('is-active')) { armAuto(); start(); }
  }

  addEventListener('sequence:ready', init);
  init();
})();
