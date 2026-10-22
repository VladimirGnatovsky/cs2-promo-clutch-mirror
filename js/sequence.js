/* Fire Serpent — station sequence engine
 * ---------------------------------------------------------------------------
 * The page is a chain of STATIONS. Each station holds a seamless LOOP that
 * plays continuously. Scrolling forward plays a one-shot TRANSITION straight
 * through, pinned; its last frame is the first frame of the next station's
 * loop, so the loop takes over with no visible cut. Scrolling back plays a
 * pre-rendered reversed copy of that same transition.
 *
 *   L0 -T1-> L1 -T2-> L2 -T3-> L3 -T4-> L4 ==== L4 -T6-> L6
 *      <-T1-rev-  <-T2-rev-  ...                  <-T6-rev-
 *
 * Two neighbouring stations may idle on the SAME loop (signature and recoil
 * both hold the KP4 pose on L4): stepping between them keeps the plate and
 * only swaps the overlay. See sameLoopStep(). A station may also leave by a
 * BRIDGE instead of a clip (manifest `bridge`, see bridgeStep()) where two
 * different loops share their first frame.
 *
 * A station may carry a one-shot FIRE insert (manifest `fire`): on request the
 * insert clip plays once over the idle loop and hands back to it on its last
 * frame, frame-accurately (recoil: the L4s burst). See fire().
 *
 * Everything about which file plays where lives in assets/sequence/manifest.json.
 * Swapping placeholders for real clips is a manifest edit only. So is the
 * playback speed: manifest `speed` sets video.playbackRate per clip url (see
 * applyRate()); every clock below is media time or media time / rate.
 *
 * There is no native scroll. Wheel, touch, keys, the rail and the menu all
 * drive the same step()/jump() pair.
 *
 * One seam the footage cannot guarantee: a loop is at an arbitrary point in its
 * cycle when the visitor scrolls, so its frame is not the transition's frame 0.
 * Handled by manifest `seam` — if the loop will wrap within waitForWrapMs we
 * ride it round and hard-cut on the wrap (the frames match by construction:
 * a loop's first frame IS the transition's first frame); otherwise we fire now
 * and cover that one swap with a crossfadeMs opacity fade. The far side of a
 * transition is always a hard, frame-accurate swap.
 *
 * No dependencies. Single IIFE, no module loading, no build step.
 */
(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const now = () => performance.now();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const MANIFEST = 'assets/sequence/manifest.json';
  const WHEEL_THRESHOLD = 110;   // accumulated px before a step fires
  const WHEEL_RESET_MS = 260;    // stale accumulator decay
  const SWIPE_THRESHOLD = 60;    // px of vertical travel
  const SETTLE_MS = 420;         // input lock after a transition, eats inertia
  const FIRST_FRAME_TIMEOUT = 600;
  const CROSSFADE_MS = 500;      // direct jump of more than one station
  const REDUCED_FADE_MS = 300;
  const SEAM_DEFAULTS = { waitForWrapMs: 350, crossfadeMs: 120 };
  const POOL_SIZE = 5;           // simultaneous <video> decoders; manifest `poolSize`
  const STALL_MS = 3000;         // no playback progress for this long = give up
  /* Copy choreography. The outgoing copy leaves in --out (CSS) the moment a
     step starts; the incoming copy is cued off the transition's own clock at
     COPY_IN_AT of its duration, and its entrance is stretched to fill the
     time left so it settles as the last frame lands. */
  const COPY_IN_AT = 0.7;        // fraction of the transition's duration
  const COPY_STAGGER_MS = 80;    // per line
  const COPY_IN_MIN_MS = 650;    // entrance length bounds (per line)
  const COPY_IN_MAX_MS = 2600;
  const COPY_IN_DEFAULT_MS = 900; // boot and direct jumps
  const COPY_GROUPS = '.story-copy,.hero-caption,.legacy-copy,.signature-heading,.closing-actions';

  const stage = $('#stage');
  const sections = $$('.station');
  const rails = $$('.chapter-rail a');
  const menu = $('#chapterMenu');
  const menuLinks = $$('#chapterMenu nav a');
  const counter = $('#stationCounter');
  const nameLabel = $('#stationName');
  const progressFill = $('#progressFill');
  const stepBack = $('#stepBack');
  const stepNext = $('#stepNext');
  const stepNextLabel = $('#stepNextLabel');

  let base = '';
  let stations = [];
  let seam = Object.assign({}, SEAM_DEFAULTS);
  let lastSeam = null;          // which mode the last loop -> transition swap used
  let poolSize = POOL_SIZE;
  let fps = 24;                 // manifest `fps`; locates a clip's last frame
  /* manifest `speed`: playback rate per clip url ({ default, clips: { url: rate } }).
     Everything time-based below reads media time, or divides media seconds by
     the element's rate, so the clips can be retimed without a re-encode. */
  let speed = { default: 1, clips: {} };
  let current = 0;
  let busy = false;
  let inputLockUntil = 0;
  let unlocked = false;
  let insert = null;            // the fire() insert in progress, if any

  /* clip url -> { el, loop } */
  const pool = new Map();
  /* Plates we have deliberately asked to play. The iOS autoplay unlock below
     plays and immediately re-pauses idle plates; without this claim it would
     race with, and silently pause, a transition that had just started. */
  const playing = new WeakSet();
  /* Plates rideToHold() is fast-forwarding: their rate is not reset under it. */
  const riding = new WeakSet();

  const rateOf = url => {
    const r = Number(speed.clips && url && Object.prototype.hasOwnProperty.call(speed.clips, url) ? speed.clips[url] : speed.default);
    return r > 0 ? r : 1;
  };
  /* Set on every (re)start and prime: some browsers reset playbackRate to
     defaultPlaybackRate on a src change or load(), so both are kept. */
  function applyRate(el) {
    if (!el || riding.has(el)) return;
    const r = rateOf(el.dataset.clip);
    try {
      if (el.defaultPlaybackRate !== r) el.defaultPlaybackRate = r;
      if (el.playbackRate !== r) el.playbackRate = r;
    } catch { /* ignore */ }
  }
  /* Wall-clock ms for `mediaS` seconds of this element's footage. */
  const wallMs = (el, mediaS) => mediaS * 1000 / ((el && el.playbackRate) || 1);

  /* ---------------------------------------------------------------- plates */

  function plate(url, isLoop, focal, priority) {
    const want = priority === 'auto' ? 'auto' : 'metadata';
    let entry = pool.get(url);
    if (entry) {
      /* Upgrade only. Dropping a buffered element back to metadata frees
         nothing and would just throw away work already done. */
      if (want === 'auto' && entry.el.preload !== 'auto') entry.el.preload = 'auto';
      return entry.el;
    }

    const el = document.createElement('video');
    el.className = 'plate';
    el.muted = true;
    el.defaultMuted = true;
    el.playsInline = true;
    el.setAttribute('muted', '');
    el.setAttribute('playsinline', '');
    el.setAttribute('webkit-playsinline', '');
    el.preload = want;
    el.loop = !!isLoop;      // native loop is gapless enough here; see note below
    el.disablePictureInPicture = true;
    el.setAttribute('aria-hidden', 'true');
    el.dataset.clip = url;
    if (focal) el.style.objectPosition = `${focal.x}% ${focal.y}%`;
    el.src = base + url;
    applyRate(el);
    el.load();
    applyRate(el);

    /* Prime: park the clip on frame 0 so a later play() has nothing to seek.
       Transitions especially — they must start on their own first frame. */
    el.addEventListener('loadedmetadata', () => { applyRate(el); try { el.currentTime = 0; } catch { /* ignore */ } }, { once: true });

    /* Plates are inserted before the shade/edge overlays so those stay on top. */
    stage.insertBefore(el, stage.firstChild);
    pool.set(url, { el, loop: !!isLoop });
    return el;
  }

  function release(url) {
    const entry = pool.get(url);
    if (!entry) return;
    const el = entry.el;
    if (el.classList.contains('is-live') || el.classList.contains('is-incoming')) return;
    pausePlate(el);
    el.removeAttribute('src');
    el.load();               // drops the decoder and the buffered data
    el.remove();
    pool.delete(url);
  }

  /* Keep exactly the clips reachable in one step from where we are, in
     priority order, capped at poolSize. Forward is the likely direction, so
     those three fully buffer (preload="auto"); the two clips behind us only
     hold their metadata and are upgraded on demand when the visitor turns
     round. That keeps a phone to three decoding video elements, not five. */
  function warmWindow() {
    if (busy) return;
    const wish = [];
    const add = (station, key, isLoop, priority) => {
      const url = station && (key === 'fire' ? station.fire && station.fire.clip : station[key]);
      if (!url || wish.some(w => w.url === url)) return;   // two stations may share a loop
      wish.push({ url, isLoop, priority, focal: station.focal });
    };
    add(stations[current], 'loop', true, 'auto');
    add(stations[current], 'fire', false, 'auto');
    add(stations[current], 'transitionOut', false, 'auto');
    add(stations[current + 1], 'loop', true, 'auto');
    add(stations[current + 1], 'fire', false, 'metadata');
    add(stations[current - 1], 'transitionOutRev', false, 'metadata');
    add(stations[current - 1], 'loop', true, 'metadata');

    const keep = wish.slice(0, Math.max(1, poolSize));
    const want = new Set(keep.map(w => w.url));
    for (const w of keep) plate(w.url, w.isLoop, w.focal, w.priority);
    for (const url of [...pool.keys()]) if (!want.has(url)) release(url);
  }

  /* -------------------------------------------------------------- readiness */

  /* readyState 3 (HAVE_FUTURE_DATA) is what we want. iOS often refuses to go
     past 1 until something plays, so after `soft` ms we accept 2, and after
     `hard` ms we go regardless — the frame-accurate handoff below is what
     actually guarantees no black flash, this is only about latency. */
  function whenReady(el, soft = 1400, hard = 6000) {
    if (el.readyState >= 3) return Promise.resolve();
    const t0 = now();
    return new Promise(resolve => {
      const poll = () => {
        const dt = now() - t0;
        if (el.readyState >= 3 || (dt > soft && el.readyState >= 2) || dt > hard) resolve();
        else setTimeout(poll, 60);
      };
      poll();
    });
  }

  /* Resolves once the element has actually PRESENTED a frame — not merely
     fired `playing` or `canplay`, both of which happen before anything is on
     screen. requestVideoFrameCallback is the real signal; timeupdate is the
     fallback for browsers without it; the timeout is the last resort so a
     stalled decoder can never freeze the page. */
  function firstFrame(el, timeout = FIRST_FRAME_TIMEOUT) {
    return new Promise(resolve => {
      let done = false;
      let handle = 0;
      const startedAt = el.currentTime;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        el.removeEventListener('timeupdate', onTimeUpdate);
        if (handle && typeof el.cancelVideoFrameCallback === 'function') {
          try { el.cancelVideoFrameCallback(handle); } catch { /* ignore */ }
        }
        resolve();
      };
      const onTimeUpdate = () => { if (el.currentTime !== startedAt && el.readyState >= 2) finish(); };
      if (typeof el.requestVideoFrameCallback === 'function') {
        handle = el.requestVideoFrameCallback(() => finish());
      }
      el.addEventListener('timeupdate', onTimeUpdate);
      const timer = setTimeout(finish, timeout);
    });
  }

  /* Resolves true when the clip really reached its end, false when the circuit
     breaker fired. `ended` is reliable for one-shot playback but a throttled tab
     can swallow it, so a poll backs it up — and that poll is also where a
     refused play() gets nudged and where a genuinely stuck transition is given
     up on. Without the breaker a play() that is rejected forever would leave
     `busy` set and the page pinned with no way out.
     With requestVideoFrameCallback it resolves earlier, inside the callback for
     the clip's LAST frame, so the caller can cut to the next loop in the same
     rendering update instead of holding that frame until `ended` (which fires
     a frame or more later and used to read as a stall before the jump). */
  function whenEnded(el) {
    return new Promise(resolve => {
      let done = false;
      let handle = 0;
      const started = now();
      const limit = (Number.isFinite(el.duration) && el.duration > 0 ? wallMs(el, el.duration) : 12000) + 2000;
      let seenTime = el.currentTime;
      let seenAt = started;
      const finish = ended => {
        if (done) return;
        done = true;
        el.removeEventListener('ended', onEnded);
        clearInterval(iv);
        if (handle) { try { el.cancelVideoFrameCallback(handle); } catch { /* ignore */ } }
        resolve(ended);
      };
      const onEnded = () => finish(true);
      el.addEventListener('ended', onEnded);
      if (typeof el.requestVideoFrameCallback === 'function') {
        const onFrame = (t, meta) => {
          handle = 0;
          if (done) return;
          if (Number.isFinite(el.duration) && meta.mediaTime >= el.duration - 1.5 / fps) return finish(true);
          handle = el.requestVideoFrameCallback(onFrame);
        };
        handle = el.requestVideoFrameCallback(onFrame);
      }
      /* currentTime is a continuous clock: it passes duration - 0.05 while the
         second-to-last frame is still on screen. With frame callbacks only
         `ended` may end the clip early here, so the cut lands on the last frame. */
      const nearEnd = typeof el.requestVideoFrameCallback === 'function' ? 0.25 / fps : 0.05;
      const iv = setInterval(() => {
        if (el.ended || (el.duration && el.currentTime >= el.duration - nearEnd)) return finish(true);
        const t = now();
        if (el.currentTime !== seenTime) { seenTime = el.currentTime; seenAt = t; }
        /* A hidden tab is deliberately paused by the visibilitychange handler
           below: do not fight it, and do not count that time as a stall. */
        if (document.hidden) { seenAt = t; return; }
        if (el.paused && playing.has(el)) el.play().catch(() => {});
        if (t - started > limit || t - seenAt > STALL_MS) finish(false);
      }, 120);
    });
  }

  async function safePlay(el) {
    playing.add(el);
    applyRate(el);
    try { await el.play(); } catch { /* autoplay refused; the decoded frame still shows */ }
  }

  function pausePlate(el, rewind) {
    if (!el) return;
    playing.delete(el);
    try { el.pause(); if (rewind) el.currentTime = 0; } catch { /* ignore */ }
  }

  function livePlate() { return stage.querySelector('.plate.is-live'); }

  /* The whole trick, in three lines: the incoming plate is opaque but sits at
     z-index 1, decoding underneath the live plate at z-index 2. When it has
     presented a frame we swap the classes. Because both layers are already
     painted, the swap is a compositor reorder — there is no instant with no
     video, so no black flash and no repeated frame. */
  async function reveal(incoming, fadeMs) {
    const outgoing = livePlate();
    incoming.classList.add('is-incoming');
    await safePlay(incoming);
    await firstFrame(incoming);
    /* fadeMs > 0 covers a swap whose two frames do not match (entering a
       transition mid-loop, or a direct jump). The incoming plate is already
       painted underneath, so this is a true crossfade, never a fade to black. */
    if (fadeMs > 0 && outgoing && outgoing !== incoming) {
      outgoing.style.setProperty('--fade', fadeMs + 'ms');
      outgoing.classList.add('is-fading');
      await sleep(fadeMs);
    }
    incoming.classList.remove('is-incoming');
    incoming.classList.add('is-live');
    if (outgoing && outgoing !== incoming) {
      /* One synchronous mutation: the plate loses `is-live` (opacity 0, z 0)
         and `is-fading` (and its transition) in the same style recalc, so the
         removed fade can never flash it back to full opacity. */
      outgoing.classList.remove('is-live', 'is-incoming', 'is-fading');
      outgoing.style.removeProperty('--fade');
      pausePlate(outgoing);
    }
    return outgoing;
  }

  /* Park a plate, paused on frame 0, opaque underneath the live plate, so that
     frame is already painted when we cut to it. Resolves true once it has been
     on screen (under the live plate) for a couple of frames. */
  async function prime(el) {
    applyRate(el);
    await whenReady(el);
    if (el.currentTime > 0.001) {
      try { el.currentTime = 0; } catch { /* ignore */ }
      await new Promise(r => { el.addEventListener('seeked', r, { once: true }); setTimeout(r, FIRST_FRAME_TIMEOUT); });
    }
    if (el.readyState < 2 || el.classList.contains('is-live')) return false;
    el.classList.add('is-incoming');
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return el.readyState >= 2 && el.currentTime <= 0.001 && el.classList.contains('is-incoming');
  }

  /* A primed plate is holding exactly the frame the live plate is showing
     (a transition's last frame IS the next loop's frame 0; a loop's wrap IS its
     transition's frame 0). Swap them synchronously — called from inside a
     video-frame callback this lands in the same rendering update — and only
     then start playback, so the incoming clip's first frame is really shown
     and no frame is skipped or held. */
  function cut(incoming) {
    const outgoing = livePlate();
    incoming.classList.remove('is-incoming');
    incoming.classList.add('is-live');
    if (outgoing && outgoing !== incoming) {
      outgoing.classList.remove('is-live', 'is-incoming', 'is-fading');
      outgoing.style.removeProperty('--fade');
      pausePlate(outgoing);
    }
    safePlay(incoming);
    return outgoing;
  }

  /* object-fit: cover crops each station's footage around its own `focal`, so
     on any viewport that is not 16:9 the same picture sits at a different
     offset under two focals. A transition therefore pans its object-position
     from the station it leaves to the station it reaches, driven by the frame
     actually being presented (eased), and lands exactly on the destination
     loop's crop on its last frame. Returns a stopper. */
  const focalOf = f => ({ x: f && Number.isFinite(f.x) ? f.x : 50, y: f && Number.isFinite(f.y) ? f.y : 50 });
  function setFocal(el, f) { el.style.objectPosition = `${+f.x.toFixed(3)}% ${+f.y.toFixed(3)}%`; }
  function panFocal(el, fromFocal, toFocal) {
    const a = focalOf(fromFocal);
    const b = focalOf(toFocal);
    setFocal(el, a);
    if (a.x === b.x && a.y === b.y) return () => {};
    let stopped = false;
    let handle = 0;
    const apply = t => {
      const end = Number.isFinite(el.duration) && el.duration > 0 ? el.duration - 1 / fps : 0;
      const p = end > 0 ? Math.min(1, Math.max(0, t / end)) : 0;
      const e = p * p * (3 - 2 * p);   // smoothstep: no speed step at either end
      setFocal(el, { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e });
    };
    const rvfc = typeof el.requestVideoFrameCallback === 'function';
    const tick = (t, meta) => {
      if (stopped) return;
      apply(rvfc && meta ? meta.mediaTime : el.currentTime);
      handle = rvfc ? el.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    };
    handle = rvfc ? el.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    return () => {
      stopped = true;
      try { if (rvfc) el.cancelVideoFrameCallback(handle); else cancelAnimationFrame(handle); } catch { /* ignore */ }
      setFocal(el, b);
    };
  }

  /* Resolves when a natively looping element wraps back to the start, which is
     the only moment its frame is guaranteed to equal the transition's frame 0.
     There is no event for a `loop` wrap, so watch the presented media time
     fall (requestVideoFrameCallback: resolves inside that frame's callback),
     or currentTime per animation frame where that API is missing. */
  function whenWrapped(el, timeout) {
    return new Promise(resolve => {
      let done = false;
      let previous = el.currentTime;
      let handle = 0;
      const rvfc = typeof el.requestVideoFrameCallback === 'function';
      const finish = wrapped => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (rvfc && handle) { try { el.cancelVideoFrameCallback(handle); } catch { /* ignore */ } }
        resolve(wrapped);
      };
      const timer = setTimeout(() => finish(false), timeout);
      const tick = (ts, meta) => {
        handle = 0;
        if (done) return;
        const t = rvfc && meta ? meta.mediaTime : el.currentTime;
        if (t < previous - 0.02) return finish(true);
        previous = t;
        handle = rvfc ? el.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
      };
      handle = rvfc ? el.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
    });
  }

  /* The loop -> transition seam. Returns the fade to use for that swap: 0 when
     we landed on the loop's wrap (frames match, so we have already cut hard to
     the primed transition — `cutDone`), else the configured crossfade. */
  async function seamFade(loopEl, incoming) {
    const miss = { fade: seam.crossfadeMs, cutDone: false };
    if (!loopEl || loopEl.paused || !loopEl.duration || !(seam.waitForWrapMs > 0)) return miss;
    const remainingMs = wallMs(loopEl, loopEl.duration - loopEl.currentTime);
    if (remainingMs > seam.waitForWrapMs) return miss;
    const wrap = whenWrapped(loopEl, seam.waitForWrapMs + 150);
    let primed = false;
    prime(incoming).then(ok => { primed = ok; });
    const wrapped = await wrap;
    if (!wrapped) return miss;
    if (primed) { cut(incoming); return { fade: 0, cutDone: true }; }
    return { fade: 0, cutDone: false };
  }

  function reportSeam(mode, fade) {
    lastSeam = { mode, fade };
    dispatchEvent(new CustomEvent('sequence:seam', { detail: lastSeam }));
  }

  /* -------------------------------------------------------------- overlays */

  function setOverlay(index, on) {
    const section = sections[index];
    if (!section) return;
    section.classList.toggle('is-active', on);
    section.inert = !on;
    if (on) dispatchEvent(new CustomEvent('sequence:station', { detail: { index, id: stations[index] && stations[index].id } }));
  }

  /* Tag each station's copy lines once, in reading order, with --i for the
     CSS stagger. Groups (story-copy etc.) contribute their children, so the
     title, each paragraph and the specs arrive one after another. */
  function tagCopyLines() {
    sections.forEach(section => {
      const inner = section.querySelector('.station-inner');
      if (!inner) return;
      const lines = [];
      for (const el of inner.children) {
        if (el.classList.contains('sr-only') || el.hasAttribute('data-hud')) continue;
        if (el.matches(COPY_GROUPS)) lines.push(...el.children);
        else lines.push(el);
      }
      lines.forEach((el, i) => { el.classList.add('copy-line'); el.style.setProperty('--i', i); });
      section.dataset.lines = lines.length;
    });
  }

  /* Visual entrance only: the section stays inert until the step has landed. */
  function showCopy(index, inMs) {
    const section = sections[index];
    if (!section) return;
    section.style.setProperty('--copy-in', Math.round(inMs) + 'ms');
    section.style.setProperty('--copy-stagger', COPY_STAGGER_MS + 'ms');
    section.classList.add('is-active');
  }

  /* ---------------------------------------------------------- hero intro
     Station 1's entrance, once per session, as the payoff of the door.
     js/preloader.js fires `preloader:done` the moment the overlay is off the
     screen (nothing here may draw over the door), then one GSAP timeline runs
     the whole first screen as a single beat: the title's words rise into view
     from behind a clip line at their own baseline, the gold sweep follows them
     across, the caption lines come up the same way, and the markers and SCROLL
     cue settle last. The split is unwrapped and every inline style cleared at
     the end, so the resting state is untouched. No GSAP (or reduced motion):
     the plain CSS fade in styles/sequence.css takes over. */
  const HERO_LEAD = 0.22;                  // the breath after the door is gone
  let heroIntroUsed = false;
  let heroTl = null;
  let heroSplits = [];
  let heroTargets = [];
  let heroClearing = false;

  /* Word-level split: whole words stay in one element, so the text reads the
     same to a screen reader and `revert()` puts the original markup back. */
  function splitWords(el) {
    const original = el.innerHTML;
    const out = [];
    const frag = document.createDocumentFragment();
    for (const node of [...el.childNodes]) {
      if (node.nodeType !== 3) { frag.appendChild(node.cloneNode(true)); continue; }
      for (const part of node.nodeValue.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
        const mask = document.createElement('span');
        mask.className = 'hero-mask';
        const span = document.createElement('span');
        span.className = 'hero-word';
        span.textContent = part;
        mask.appendChild(span);
        frag.appendChild(mask);
        out.push(span);
      }
    }
    el.textContent = '';
    el.appendChild(frag);
    heroSplits.push({ el, original });
    return out;
  }
  /* the line itself becomes the mask; only the inner span moves */
  function wrapInner(el) {
    const original = el.innerHTML;
    const mask = document.createElement('span');
    mask.className = 'hero-mask';
    const span = document.createElement('span');
    span.className = 'hero-rise';
    while (el.firstChild) span.appendChild(el.firstChild);
    mask.appendChild(span);
    el.appendChild(mask);
    heroSplits.push({ el, original });
    return span;
  }

  function startHeroIntro() {
    if (heroIntroUsed) return;
    heroIntroUsed = true;
    const hero = sections[0];
    if (!hero || current !== 0) return;
    hero.classList.add('is-intro');
    const gsap = window.gsap;
    if (reduced.matches || !gsap) {             // the CSS fade carries it
      hero.classList.add('is-plain');
      const anims = hero.getAnimations ? hero.getAnimations({ subtree: true })
        .filter(a => a.effect && a.effect.getTiming().iterations !== Infinity) : null;
      if (anims && anims.length) Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => endHeroIntro());
      else setTimeout(() => endHeroIntro(), 3000);
      return;
    }
    const title = hero.querySelector('.hero-title');
    const words = title ? splitWords(title) : [];
    /* Put every clip line on the glyphs' real ink bottom, not on the CSS
       baseline: the display face overshoots it (round letters) and a line box
       shorter than the font (line-height .96) can end above the ink, which is
       what shaved the letters and then popped when the mask came off. */
    const inkCtx = (() => { try { return document.createElement('canvas').getContext('2d'); } catch { return null; } })();
    function clipToInk(mask, text, tolerance) {
      const cs = getComputedStyle(mask);
      const probe = document.createElement('span');
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
      mask.appendChild(probe);                       // last line's baseline
      const baseline = probe.getBoundingClientRect().top;
      probe.remove();
      const box = mask.getBoundingClientRect();
      const size = parseFloat(cs.fontSize) || 16;
      let descent = size * 0.08;                     // safe guess: always below the ink
      const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const ready = !document.fonts || !document.fonts.check || document.fonts.check(font);
      if (inkCtx && ready) {
        try {
          inkCtx.font = font;
          const m = inkCtx.measureText(text);
          if (m && isFinite(m.actualBoundingBoxDescent)) descent = Math.max(0, m.actualBoundingBoxDescent);
        } catch { /* keep the guess */ }
      }
      const inset = box.bottom - (baseline + descent + tolerance);
      mask.style.clipPath = `inset(-60% -10% ${inset.toFixed(2)}px -10%)`;
    }
    words.forEach(word => clipToInk(word.parentElement, word.textContent, 2));
    const lines = [...hero.querySelectorAll('.hero-line')].map(line => {
      const rise = wrapInner(line);
      clipToInk(rise.parentElement, line.textContent, 2);   // descenders included
      return rise;
    });
    const markers = [hero.querySelector('.hero-caption > span'), hero.querySelector('.hero-top'), hero.querySelector('.hero-edition')].filter(Boolean);
    const cue = hero.querySelector('.scroll-cue');
    heroTargets = [hero, title, ...words, ...lines, ...markers, cue].filter(Boolean);

    gsap.set(hero, { '--wash': 0.55 });
    gsap.set(title, { '--sweep': 0 });
    gsap.set([...words, ...lines], { yPercent: 112, scaleY: 1.07, transformOrigin: '50% 100%' });
    gsap.set([...markers, cue], { opacity: 0, '--rise': '12px' });

    /* The breath sits inside the timeline (not as a `delay`), so the whole
       entrance is one scrubbable unit — that is what the frame-exact recording
       steps through (window.sequence.heroTimeline). */
    const L = HERO_LEAD;
    heroTl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: () => endHeroIntro() });
    heroTl
      .to(words, { yPercent: 0, scaleY: 1, duration: 1.15, stagger: 0.085 }, L)
      .to(hero, { '--wash': 0, duration: 1.5, ease: 'power2.out' }, L)
      .to(title, { '--sweep': 1, duration: 1.9, ease: 'sine.inOut' }, L + 1.2)
      .to(lines, { yPercent: 0, scaleY: 1, duration: 0.95, stagger: 0.11 }, L + 0.46)
      .to(markers, { opacity: 1, '--rise': '0px', duration: 0.8, stagger: 0.1, ease: 'power3.out' }, L + 0.92)
      .to(cue, { opacity: 1, '--rise': '0px', duration: 0.9, ease: 'power3.out' }, L + 2.3);
  }

  /* Cancelled early (the visitor scrolled): jump the timeline to its end state
     rather than leaving half-drawn type behind. */
  function endHeroIntro(settle) {
    const hero = sections[0];
    // `progress(1)` below fires the timeline's own onComplete, which lands back
    // here: let the first call through and make the rest no-ops.
    if (heroClearing || !hero || !hero.classList.contains('is-intro')) return;
    heroClearing = true;
    const tl = heroTl;
    heroTl = null;
    try {
      if (tl) {
        if (settle === true) tl.progress(1);
        tl.kill();
      }
      if (window.gsap && heroTargets.length) window.gsap.set(heroTargets, { clearProps: 'all' });
    } catch (error) {
      console.warn('sequence: hero intro cleanup', error);
    }
    heroTargets = [];
    heroSplits.forEach(({ el, original }) => { el.innerHTML = original; });
    heroSplits = [];
    hero.classList.remove('is-intro', 'is-plain');
    heroClearing = false;
  }

  /* Only once the overlay is gone (see js/preloader.js): the door must be off
     the screen before the title moves. */
  addEventListener('preloader:done', startHeroIntro, { once: true });

  /* Watch the transition's currentTime (rAF, with timeupdate as a backstop for
     throttled frames) and start the incoming copy at COPY_IN_AT of its
     duration. The entrance is sized to the time that remains, so a 4 s clip
     and an 11 s clip both settle on their last frame. Returns a canceller. */
  function cueCopy(el, index) {
    let done = false;
    let raf = 0;
    const lines = Number(sections[index] && sections[index].dataset.lines) || 1;
    const fire = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      el.removeEventListener('timeupdate', check);
      const leftMs = Number.isFinite(el.duration) ? Math.max(0, wallMs(el, el.duration - el.currentTime)) : 0;
      const inMs = Math.min(COPY_IN_MAX_MS, Math.max(COPY_IN_MIN_MS, leftMs - (lines - 1) * COPY_STAGGER_MS));
      showCopy(index, inMs);
    };
    function check() {
      if (done) return;
      const d = el.duration;
      if (Number.isFinite(d) && d > 0 && el.currentTime >= d * COPY_IN_AT) return fire();
      raf = requestAnimationFrame(check);
    }
    el.addEventListener('timeupdate', check);
    check();
    return fire;   // calling it early simply shows the copy now
  }

  function markStation(index) {
    if (index !== 0) endHeroIntro(true);
    const station = stations[index];
    rails.forEach((a, i) => {
      const on = i === index;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    menuLinks.forEach((a, i) => a.classList.toggle('active', i === index));
    counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(stations.length).padStart(2, '0')}`;
    nameLabel.textContent = (station.chapter || station.id).toUpperCase();
    progressFill.style.transform = `scaleX(${(index + 1) / stations.length})`;
    stepBack.disabled = index === 0;
    /* The Legacy overlay already carries its own FROM THE TOP button, so the
       footer step hides rather than duplicating it. */
    stepNext.hidden = index === stations.length - 1;
    stepNextLabel.textContent = 'NEXT';
    document.body.dataset.station = station.id;
  }

  /* Deliberately NOT part of markStation: the rail and the counter lead the
     picture so the page feels responsive, but the URL only changes once the
     visitor is actually standing at the new station. */
  function syncHash(index) {
    const hash = '#' + stations[index].id;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  /* ------------------------------------------------------------ navigation */

  /* One station forward or back: the cinematic path. */
  async function step(direction) {
    if (busy || !stations.length) return;
    const from = current;
    const to = from + direction;
    if (to < 0 || to >= stations.length) return;
    await standDown();

    const owner = direction > 0 ? stations[from] : stations[to];
    const url = direction > 0 ? owner.transitionOut : owner.transitionOutRev;
    if (stations[to].loop === stations[from].loop) return sameLoopStep(to);
    if (reduced.matches) return jump(to);
    if (!url) return owner.bridge ? bridgeStep(to, owner.bridge) : jump(to);

    busy = true;
    document.body.classList.add('is-moving');
    setOverlay(from, false);                       // --out (350 ms) fade out, CSS
    markStation(to);                               // rail/counter lead the picture

    const transition = plate(url, false, owner.focal, 'auto');
    // The clip starts in the crop of the station we leave and pans to the
    // crop of the station we reach (see panFocal), in both directions.
    const stopPan = panFocal(transition, stations[from].focal, stations[to].focal);
    await whenReady(transition);
    try { if (transition.currentTime > 0.001) transition.currentTime = 0; } catch { /* ignore */ }

    // loop -> transition. Ride the loop to its wrap if it is nearly there
    // (free, exact: cut to the primed transition on the wrap frame), otherwise
    // cover the mismatch with a short crossfade. Either way the loop is hidden
    // only once the transition has painted.
    const liveLoop = livePlate();
    const { fade, cutDone } = await seamFade(liveLoop, transition);
    reportSeam(fade > 0 ? 'crossfade' : 'wrap', fade);
    const loopPlate = cutDone ? liveLoop : await reveal(transition, fade);
    if (loopPlate) { try { loopPlate.currentTime = 0; } catch { /* ignore */ } }  // park it on its own start frame
    // The incoming copy rides the transition's clock, not its `ended`.
    const showNow = cueCopy(transition, to);

    // Prime the destination loop while the transition runs: paused on its
    // frame 0, painted underneath, so the second handoff is a pure cut.
    const nextLoop = plate(stations[to].loop, true, stations[to].focal, 'auto');
    let primed = false;
    const priming = prime(nextLoop).then(ok => { primed = ok; });

    const completed = await whenEnded(transition);
    stopPan();                                     // exactly the destination crop
    if (completed && primed) {
      // Inside the last frame's callback: the transition's last frame IS the
      // loop's frame 0, already painted underneath in the same crop.
      cut(nextLoop);
    } else {
      showNow();
      if (!completed) {
        // The breaker fired: the transition never reached its last frame, so the
        // frames will not match and the swap has to be covered by a crossfade.
        console.warn(`[sequence] ${url} stalled; completing the step to "${stations[to].id}" without it`);
      }
      // On a clean finish the transition is holding its last frame, which IS the
      // next loop's first frame — so any wait here is invisible, not a black gap.
      await priming;
      try { if (nextLoop.currentTime > 0.001) nextLoop.currentTime = 0; } catch { /* ignore */ }
      await reveal(nextLoop, completed ? 0 : seam.crossfadeMs);
    }
    showNow();                                     // no-op if already cued
    pausePlate(transition, true);

    current = to;
    syncHash(to);
    setOverlay(to, true);
    document.body.classList.remove('is-moving');
    busy = false;
    inputLockUntil = now() + SETTLE_MS;
    warmWindow();
  }

  /* ------------------------------------------------------- same-loop step */

  /* Neighbours that idle on one and the same loop file share one plate (the
     pool is keyed by url), so there is nothing to swap: the picture keeps
     running and only the overlays change. */
  async function sameLoopStep(to) {
    const from = current;
    busy = true;
    document.body.classList.add('is-moving');
    setOverlay(from, false);
    markStation(to);
    reportSeam('same-loop', 0);
    await sleep(reduced.matches ? 150 : 260);   // let the outgoing copy clear
    showCopy(to, reduced.matches ? REDUCED_FADE_MS : COPY_IN_DEFAULT_MS);
    current = to;
    syncHash(to);
    setOverlay(to, true);
    document.body.classList.remove('is-moving');
    busy = false;
    inputLockUntil = now() + SETTLE_MS;
    warmWindow();
  }

  /* ----------------------------------------------------------- fire insert */

  function emitFire(phase, el) {
    dispatchEvent(new CustomEvent('sequence:fire', { detail: { phase, station: stations[current] && stations[current].id, el } }));
  }

  /* Play the current station's `fire` clip once over its idle loop.
     1. park the clip paused on frame 0, painted under the loop;
     2. ride the loop into one of fire.holds (frames that match the clip's
        frame 0), fast-forwarding so the wait stays under fire.maxWaitMs;
     3. reveal the clip (short crossfade hides sub-pixel breathing);
     4. park the loop on ITS frame 0 underneath and, inside the clip's last
        frame callback, cut back to it — the clip ends on that same frame.
     Resolves true when it played through, false when refused or cancelled.
     Presses while an insert runs, or while the page is moving, are ignored. */
  async function fire() {
    const station = stations[current];
    const cfg = station && station.fire;
    if (!cfg || !cfg.clip || busy || insert) return false;
    const loopEl = livePlate();
    if (!loopEl) return false;
    const token = { cancelled: false, stage: 'arming', loopEl, clip: null, done: null };
    let release;
    token.done = new Promise(r => { release = r; });
    token.stop = new Promise(r => { token.signal = r; });
    insert = token;
    const clip = plate(cfg.clip, false, station.focal, 'auto');
    token.clip = clip;
    emitFire('arming', clip);
    const finish = ok => {
      if (insert === token) insert = null;
      riding.delete(loopEl);
      applyRate(loopEl);
      release(ok);
      return ok;
    };
    const abandon = () => {
      if (!clip.classList.contains('is-live')) { clip.classList.remove('is-incoming'); pausePlate(clip, true); }
      return finish(false);
    };

    await whenReady(clip);
    if (token.cancelled) return abandon();
    await prime(clip);
    if (token.cancelled) return abandon();
    if (!reduced.matches) {
      await Promise.race([rideToHold(loopEl, cfg.holds || station.holds || [], { fadeMs: cfg.fadeMs, maxWaitMs: cfg.maxWaitMs, maxRate: cfg.maxRate }), token.stop]);
      if (token.cancelled) return abandon();
    }
    token.stage = 'firing';
    const fade = reduced.matches ? 0 : (cfg.fadeMs || 0);
    const outgoing = await reveal(clip, fade);
    if (outgoing) { riding.delete(outgoing); applyRate(outgoing); }
    if (token.cancelled) {
      // Cancelled while the reveal was running: back out to the hold pose here.
      try { loopEl.currentTime = 0; } catch { /* ignore */ }
      await reveal(loopEl, reduced.matches ? 0 : (cfg.cancelFadeMs || 240));
      if (reduced.matches) pausePlate(loopEl);
      pausePlate(clip, true);
      return finish(false);
    }
    token.revealed = true;
    emitFire('firing', clip);

    // The loop waits underneath on its own frame 0, which is the clip's last frame.
    let primed = false;
    try { loopEl.currentTime = 0; } catch { /* ignore */ }
    const priming = prime(loopEl).then(ok => { primed = ok; });
    const completed = await Promise.race([whenEnded(clip), token.stop.then(() => null)]);
    if (token.cancelled || completed === null) return finish(false);
    if (completed && primed) cut(loopEl);
    else {
      await priming;
      if (token.cancelled) return finish(false);
      try { if (loopEl.currentTime > 0.001) loopEl.currentTime = 0; } catch { /* ignore */ }
      await reveal(loopEl, completed ? 0 : seam.crossfadeMs);
    }
    if (reduced.matches) pausePlate(loopEl);
    pausePlate(clip, true);
    emitFire('done', clip);
    return finish(true);
  }

  /* Called before any step or jump. An insert that has not started yet is
     simply dropped; a burst already on screen is cut with a short crossfade
     back to the hold pose (the loop's frame 0), so the move that follows
     always leaves from the idle frame its clips were made for. */
  async function standDown() {
    const token = insert;
    if (!token) return;
    token.cancelled = true;
    token.signal();
    const wasBusy = busy;
    busy = true;
    const cfg = (stations[current] && stations[current].fire) || {};
    if (token.revealed && token.clip.classList.contains('is-live')) {
      const loopEl = token.loopEl;
      loopEl.classList.remove('is-incoming');
      try { loopEl.currentTime = 0; } catch { /* ignore */ }
      await whenReady(loopEl, 400, 1500);
      await reveal(loopEl, reduced.matches ? 0 : (cfg.cancelFadeMs || 240));
      if (reduced.matches) pausePlate(loopEl);
      pausePlate(token.clip, true);
    }
    await token.done;
    emitFire('cancelled', token.clip);
    busy = wasBusy;
  }

  /* ------------------------------------------------------------- bridge */

  /* Seconds until the loop reaches a frame where a handoff is invisible: 0
     when `t` is inside one of `holds` with at least `needS` of it left,
     otherwise the time to the start of the next hold long enough to use.
     Holds are ranges of near-identical frames (the shared KP4 pose); a hold
     that runs to the loop's end continues into one that starts at 0. */
  function untilHold(t, holds, dur, needS) {
    const ranges = holds.map(([a, b]) => [a, Math.min(b, dur)]);
    const head = ranges.find(r => r[0] <= 0.001);
    const endOf = ([a, b]) => (head && b >= dur - 0.06 ? dur + head[1] : b);
    let best = Infinity;
    for (const r of ranges) {
      const end = endOf(r);
      if (t >= r[0] && t < r[1] && end - t >= needS) return 0;
      if (end - r[0] >= needS) best = Math.min(best, (r[0] > t ? r[0] : r[0] + dur) - t);
    }
    return best;
  }

  /* Ride a looping plate forward into its next hold, fast-forwarding (up to
     bridge.maxRate, never below the clip's own speed) so the wait stays under
     bridge.maxWaitMs. `wait` is media seconds; at `rate` it takes wait/rate. */
  function rideToHold(el, holds, bridge) {
    const fadeS = (bridge.fadeMs || 0) / 1000;
    const need = fadeS + 0.12;
    if (!el || el.paused || !el.duration || !Array.isArray(holds) || !holds.length) return Promise.resolve();
    const wait = untilHold(el.currentTime, holds, el.duration, need);
    if (wait === 0 || !Number.isFinite(wait)) return Promise.resolve();
    const maxWait = (bridge.maxWaitMs || 1600) / 1000;
    const own = rateOf(el.dataset.clip);
    const rate = Math.max(own, Math.min(bridge.maxRate || 3, wait / maxWait));
    riding.add(el);
    try { el.playbackRate = rate; } catch { /* ignore */ }
    const guard = now() + maxWait * 1000 + 1500;
    return new Promise(resolve => {
      const tick = () => {
        if (untilHold(el.currentTime, holds, el.duration, need) === 0 || now() > guard) {
          riding.delete(el);
          applyRate(el);
          return resolve();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* One station forward or back between two loops that open on the same
     frame, with no clip in between. The loop being left is ridden into a
     hold (a stretch of frames that match the shared first frame), then the
     other loop is revealed on its frame 0 under a short crossfade. Because
     both pictures are the same pose, the crossfade reads as nothing at all;
     it only hides sub-pixel breathing. Both directions use this. */
  async function bridgeStep(to, bridge) {
    const from = current;
    busy = true;
    document.body.classList.add('is-moving');
    setOverlay(from, false);
    markStation(to);

    const target = plate(stations[to].loop, true, stations[to].focal, 'auto');
    const ready = whenReady(target);
    await rideToHold(livePlate(), stations[from].holds, bridge);
    await ready;
    try { if (target.currentTime > 0.001) target.currentTime = 0; } catch { /* ignore */ }
    const fade = bridge.fadeMs || 0;
    reportSeam('bridge', fade);
    showCopy(to, COPY_IN_DEFAULT_MS);
    const outgoing = await reveal(target, fade);
    if (outgoing) { riding.delete(outgoing); applyRate(outgoing); try { outgoing.currentTime = 0; } catch { /* ignore */ } }

    current = to;
    syncHash(to);
    setOverlay(to, true);
    document.body.classList.remove('is-moving');
    busy = false;
    inputLockUntil = now() + SETTLE_MS;
    warmWindow();
  }

  /* More than one station away, or reduced motion: no transition footage, just
     a straight crossfade to the target loop. Simple beats a 4x speed-run. */
  async function jump(index, ms) {
    if (busy || !stations.length || index === current || index < 0 || index >= stations.length) return;
    await standDown();
    if (stations[index].loop === stations[current].loop) return sameLoopStep(index);
    const fade = ms != null ? ms : (reduced.matches ? REDUCED_FADE_MS : CROSSFADE_MS);
    busy = true;
    document.body.classList.add('is-moving');
    setOverlay(current, false);
    markStation(index);

    const target = plate(stations[index].loop, true, stations[index].focal, 'auto');
    await whenReady(target);
    try { if (target.currentTime > 0.001) target.currentTime = 0; } catch { /* ignore */ }
    // No transition clock here: the copy enters alongside the crossfade.
    showCopy(index, reduced.matches ? REDUCED_FADE_MS : COPY_IN_DEFAULT_MS);
    const outgoing = await reveal(target, fade);
    if (outgoing) { try { outgoing.currentTime = 0; } catch { /* ignore */ } }
    if (reduced.matches) pausePlate(target);

    current = index;
    syncHash(index);
    setOverlay(index, true);
    document.body.classList.remove('is-moving');
    busy = false;
    inputLockUntil = now() + SETTLE_MS;
    warmWindow();
  }

  function goTo(index) {
    if (index === current) return;
    if (Math.abs(index - current) === 1) step(index - current);
    else jump(index);
  }

  /* ---------------------------------------------------------------- input */

  /* One user gesture is enough to lift iOS/Safari autoplay restrictions for
     every element already in the pool, so do it on the first touch or key. */
  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const live = livePlate();
    // If the live loop is already running, autoplay is permitted here and
    // there is nothing to unlock; touching the idle plates would only churn
    // decoders for no gain. This is the desktop and the modern-iOS path.
    if (live && !live.paused) return;
    for (const { el } of pool.values()) {
      if (playing.has(el) || el.classList.contains('is-live')) continue;
      const promise = el.play();
      if (promise && promise.then) {
        promise.then(() => { if (!playing.has(el)) pausePlate(el, true); }).catch(() => {});
      }
    }
  }

  let wheelAccum = 0;
  let wheelLast = 0;
  addEventListener('wheel', event => {
    if (menu.open) return;              // the chapter dialog scrolls natively
    event.preventDefault();
    unlock();
    const t = now();
    if (busy || t < inputLockUntil) { wheelAccum = 0; wheelLast = t; return; }
    if (t - wheelLast > WHEEL_RESET_MS) wheelAccum = 0;
    wheelLast = t;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
    wheelAccum += event.deltaY * unit;
    if (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
      const direction = Math.sign(wheelAccum);
      wheelAccum = 0;
      step(direction);
    }
  }, { passive: false });

  let touchY = null;
  addEventListener('touchstart', event => {
    unlock();
    touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
  }, { passive: true });
  addEventListener('touchmove', event => {
    if (menu.open) return;
    if (event.target instanceof Element && event.target.closest('dialog')) return;
    if (event.cancelable) event.preventDefault();   // kill iOS rubber-banding
  }, { passive: false });
  addEventListener('touchend', event => {
    const startY = touchY;
    touchY = null;
    if (startY == null || menu.open) return;
    if (busy || now() < inputLockUntil) return;
    const endY = event.changedTouches[0] ? event.changedTouches[0].clientY : startY;
    const dy = startY - endY;
    if (Math.abs(dy) >= SWIPE_THRESHOLD) step(dy > 0 ? 1 : -1);
  }, { passive: true });

  addEventListener('keydown', event => {
    if (menu.open) return;
    const key = event.key;
    const onControl = document.activeElement && document.activeElement.closest('a,button');
    /* On a station with a FIRE insert, Space / Enter / F fire instead of
       stepping (a focused button keeps its own Space/Enter). */
    const firing = stations[current] && stations[current].fire && !event.altKey && !event.ctrlKey && !event.metaKey;
    /* The physical F key on any layout: Russian and Ukrainian report 'а'/'А'. */
    const fKey = event.code === 'KeyF' || ['f', 'F', 'а', 'А'].includes(key);
    if (firing && (fKey || ((key === ' ' || key === 'Enter') && !onControl))) {
      event.preventDefault(); unlock();
      dispatchEvent(new CustomEvent('sequence:fire-request', { detail: { source: 'key' } }));
      return;
    }
    if (key === 'ArrowDown' || key === 'PageDown' || (key === ' ' && !onControl) || key === 'Spacebar') {
      event.preventDefault(); unlock(); step(1);
    } else if (key === 'ArrowUp' || key === 'PageUp') {
      event.preventDefault(); unlock(); step(-1);
    } else if (key === 'Home') {
      event.preventDefault(); unlock(); goTo(0);
    } else if (key === 'End') {
      event.preventDefault(); unlock(); goTo(stations.length - 1);
    }
  });

  function bindJump(link) {
    link.addEventListener('click', event => {
      const index = stations.findIndex(s => '#' + s.id === link.getAttribute('href'));
      if (index < 0) return;
      event.preventDefault();
      unlock();
      if (menu.open) menu.close();
      goTo(index);
    });
  }
  rails.forEach(bindJump);
  menuLinks.forEach(bindJump);
  $$('.masthead a[href^="#"], .skip').forEach(bindJump);

  $$('[data-step]').forEach(button => button.addEventListener('click', () => {
    unlock();
    const direction = Number(button.dataset.step);
    if (direction > 0 && current === stations.length - 1) goTo(0);
    else step(direction);
  }));
  $('#replay').addEventListener('click', () => { unlock(); goTo(0); });

  $('#menuToggle').addEventListener('click', () => { unlock(); menu.showModal(); });
  $('#closeMenu').addEventListener('click', () => menu.close());
  menu.addEventListener('click', event => {
    if (event.target === menu && event.clientX < menu.getBoundingClientRect().left) menu.close();
  });

  /* ------------------------------------------------- station interactions */

  const detailCopy = [
    'The green serpent stretches across the receiver. Its open jaws and gold accents turn the weapon’s silhouette into a canvas.',
    'Blue-grey cloud forms curl down the magazine, carrying the artwork from the receiver into the curve below.',
    'Warm wood remains exposed on the stock and handguard. Its natural grain gives the painted steel room to breathe.'
  ];
  const detailNames = ['THE SERPENT', 'THE CLOUDS', 'THE WOOD'];
  $$('[data-detail]').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.detail);
    $$('[data-detail]').forEach(b => {
      const on = b === button;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
    $('#detailDescription').textContent = detailCopy[index];
    $('#detailName').textContent = detailNames[index];
    $('#detailNumber').textContent = String(index + 1).padStart(2, '0');
  }));

  const stickerPreview = $('#stickerPreview');
  $$('[data-sticker]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.sticker;
    $$('[data-sticker]').forEach(b => {
      const on = b === button;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (key === 'none') {
      stickerPreview.classList.remove('on');
      stickerPreview.removeAttribute('src');
      $('#stickerCaption').textContent = 'Original finish · no sticker applied';
    } else {
      stickerPreview.src = 'assets/stickers/' + key + '.png';
      stickerPreview.classList.add('on');
      $('#stickerCaption').textContent = `${button.textContent.trim()} · illustrative placement preview`;
    }
  }));

  /* The sticker preview rides the receiver through the loop's breath: the
     manifest's compositeTrack gives the plate's offset (% of frame) against
     the loop's currentTime; cover scaling turns it into px. */
  const stickerStage = $('.sticker-stage');
  let stickerRaf = 0;
  function trackSticker() {
    stickerRaf = 0;
    const index = stations.findIndex(s => s.compositeTrack);
    const station = stations[index];
    if (!station || !stickerStage || current !== index || document.hidden) return;
    const el = pool.get(station.loop) && pool.get(station.loop).el;
    if (el && el.videoWidth && !reduced.matches) {
      const list = station.compositeTrack;
      const t = el.currentTime;
      let dx = 0, dy = 0;
      for (let i = 1; i < list.length; i++) {
        if (t <= list[i][0]) {
          const a = list[i - 1], b = list[i], r = (t - a[0]) / ((b[0] - a[0]) || 1);
          dx = a[1] + (b[1] - a[1]) * r; dy = a[2] + (b[2] - a[2]) * r;
          break;
        }
      }
      const s = Math.max(innerWidth / el.videoWidth, innerHeight / el.videoHeight);
      // on the children: the stage itself is a copy line whose `translate` is transitioned
      const v = `${(dx / 100 * el.videoWidth * s).toFixed(2)}px ${(dy / 100 * el.videoHeight * s).toFixed(2)}px`;
      for (const child of stickerStage.children) child.style.translate = v;
    }
    stickerRaf = requestAnimationFrame(trackSticker);
  }
  addEventListener('sequence:station', () => { if (!stickerRaf) stickerRaf = requestAnimationFrame(trackSticker); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !stickerRaf) stickerRaf = requestAnimationFrame(trackSticker); });

  /* ------------------------------------------------------------ lifecycle */

  document.addEventListener('visibilitychange', () => {
    const live = livePlate();
    if (!live) return;
    /* pause(), not pausePlate(): the `playing` claim has to survive so the
       plate is resumed on return — including a transition that is mid-step,
       which whenEnded is waiting on. */
    if (document.hidden) { try { live.pause(); } catch { /* ignore */ } }
    else if (playing.has(live) && !reduced.matches) safePlay(live);
  });

  reduced.addEventListener('change', () => {
    const live = livePlate();
    if (!live) return;
    if (reduced.matches) pausePlate(live);
    else safePlay(live);
  });

  addEventListener('pagehide', () => { for (const url of [...pool.keys()]) release(url); });

  async function boot() {
    /* ?preloader=demo (js/preloader.js) records the preloader alone: no clips. */
    if (document.documentElement.classList.contains('pl-demo')) return;
    tagCopyLines();
    let data;
    try {
      const response = await fetch(MANIFEST, { cache: 'no-cache' });
      if (!response.ok) throw new Error('manifest ' + response.status);
      data = await response.json();
    } catch (error) {
      // fetch() fails on file:// (Chrome blocks it with a CORS error). Fall
      // back to the inline copy that index.html loads via <script> before
      // this file, if present -- see assets/sequence/manifest.js. The
      // fetched copy above still wins whenever it works (http/https), so a
      // manifest.json edit is picked up over http even if manifest.js has
      // gone stale.
      if (window.SEQUENCE_MANIFEST) {
        console.info('sequence: fetch(manifest.json) failed, using inline window.SEQUENCE_MANIFEST');
        data = window.SEQUENCE_MANIFEST;
      } else {
        // No manifest at all: leave the copy readable over the flat stage
        // rather than failing to a blank page.
        document.body.classList.add('is-ready');
        setOverlay(0, true);
        return;
      }
    }
    base = data.base || '';
    seam = Object.assign({}, SEAM_DEFAULTS, data.seam || {});
    poolSize = Number.isInteger(data.poolSize) && data.poolSize >= 1 ? data.poolSize : POOL_SIZE;
    fps = Number(data.fps) > 0 ? Number(data.fps) : 24;
    speed = Object.assign({ default: 1, clips: {} }, data.speed || {});
    stations = Array.isArray(data.stations) ? data.stations : [];
    /* The manifest owns the layout band and the sticker anchor as well as the
       clips, so re-shooting a station is still a manifest-only edit. */
    stations.forEach((station, i) => {
      const section = sections[i];
      if (!section) return;
      if (station.textZone) section.dataset.zone = station.textZone;
      const anchor = station.compositeAnchor;
      if (anchor) {
        section.style.setProperty('--anchor-x', anchor.x + '%');
        section.style.setProperty('--anchor-y', anchor.y + '%');
      }
    });
    if (!stations.length) { document.body.classList.add('is-ready'); setOverlay(0, true); return; }

    let start = 0;
    if (location.hash) {
      const index = stations.findIndex(s => '#' + s.id === location.hash);
      if (index > 0) start = index;
    }
    current = start;
    sections.forEach((section, i) => { section.classList.toggle('is-active', false); section.inert = i !== start; });
    markStation(start);
    syncHash(start);

    const first = plate(stations[start].loop, true, stations[start].focal, 'auto');
    await whenReady(first, 2000, 9000);
    await safePlay(first);
    await firstFrame(first, 900);
    if (reduced.matches) pausePlate(first, true);
    first.classList.add('is-live');

    document.body.classList.add('is-ready');
    setOverlay(start, true);
    warmWindow();
    /* Announce readiness for the QA harness and for anything embedding this. */
    document.body.dataset.ready = '1';
    if (!document.getElementById('preloader')) startHeroIntro();
    dispatchEvent(new CustomEvent('sequence:ready', { detail: { station: start } }));
  }

  /* A tiny debug surface: the QA script and the console use it, nothing else. */
  window.sequence = {
    get station() { return current; },
    get busy() { return busy; },
    get stations() { return stations; },
    get seam() { return seam; },
    get lastSeam() { return lastSeam; },
    get pool() { return [...pool.entries()].map(([url, e]) => ({ url, preload: e.el.preload })); },
    get heroTimeline() { return heroTl; },      // QA/recording handle, read-only
    get firing() { return insert ? insert.stage : null; },
    rateOf,
    step, jump, goTo, fire
  };

  boot();

  /* NOTE — if a seam ever shows at a loop's own wrap point, the fix is a
     two-element ping-pong: hold two <video> elements on the same loop file,
     start the second one at 0 a few frames before the first reaches its end
     (requestVideoFrameCallback gives the frame index to trigger on), reveal it
     with the same z-index swap reveal() uses, and alternate. That costs one
     extra decoder per station, which is why the native `loop` attribute is
     used until a real clip actually shows a hitch. */
})();
