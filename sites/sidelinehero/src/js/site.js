// Homepage behaviour: the How it works timeline and the scoreboard clock.
// The page is complete without this file. The pure helpers are exported for
// scripts/site.test.mjs; the DOM wiring at the bottom only runs in a browser.

export const STEP_LABELS = { done: 'Done', open: 'Window open', next: 'Next', upcoming: 'Upcoming' };

/** States for `count` steps when step `active` is in view, as on the app's Plan tab. */
export function stepStates(active, count) {
  return Array.from({ length: count }, (_, i) =>
    i < active ? 'done' : i === active ? 'open' : i === active + 1 ? 'next' : 'upcoming');
}

/** 372 → "06:12". Clamped at zero, so the clock never goes negative or NaN. */
export function formatClock(seconds) {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Crossfades `phone` to a new screenshot. Compares against the screenshot it
 * is heading to, not the one showing: two steps can cross the middle inside
 * one 150ms fade, and the first fade must not land after the second asks.
 */
export function phoneSwapper(phone, reduceMotion, timers = globalThis) {
  let target = phone.getAttribute('src');
  let pending = 0;
  return (src) => {
    if (src === target) return;
    target = src;
    timers.clearTimeout(pending);
    if (reduceMotion) { phone.src = src; return; }
    // A timeout, not transitionend: the phone is display:none on mobile, where
    // no transition ever fires.
    phone.classList.add('is-fading');
    pending = timers.setTimeout(() => { phone.src = src; phone.classList.remove('is-fading'); }, 150);
  };
}

function initStory(reduceMotion) {
  const steps = [...document.querySelectorAll('.step')];
  const phone = document.querySelector('[data-story-phone]');
  if (!steps.length || !phone) return;
  let current = -1;
  const swap = phoneSwapper(phone, reduceMotion);

  function show(index) {
    if (index === current) return;
    current = index;
    stepStates(index, steps.length).forEach((state, i) => {
      steps[i].dataset.state = state;
      steps[i].querySelector('.step-tag').textContent = STEP_LABELS[state];
    });
    swap(steps[index].querySelector('.step-shot').getAttribute('src'));
  }

  // A thin band across the middle of the viewport: the step crossing it is "open".
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) show(steps.indexOf(e.target));
  }, { rootMargin: '-45% 0px -45% 0px' });
  steps.forEach((s) => io.observe(s));
}

function initClock(reduceMotion) {
  const el = document.querySelector('[data-clock]');
  if (!el || reduceMotion) return;
  let left = Number(el.dataset.clock);
  let timer = 0;
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !timer && left > 0) {
      timer = setInterval(() => {
        left -= 1;
        el.textContent = formatClock(left);
        if (left <= 0) clearInterval(timer); // holds at 00:00; timer stays set so it never restarts
      }, 1000);
    } else if (!e.isIntersecting && timer && left > 0) {
      clearInterval(timer);
      timer = 0;
    }
  }).observe(el);
}

if (typeof document !== 'undefined' && 'IntersectionObserver' in window) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  initStory(reduceMotion);
  initClock(reduceMotion);
}
