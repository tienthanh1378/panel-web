// The shell's decisions that need no document, so they can be tested.

const DEMO = "panel.demo";
const EVERYTHING = ["panel.repo", "panel.token", "panel.cache", "panel.dismissed", DEMO];

/** What leaving forgets. Leaving the demo forgets only that it was on: the
 *  repository and the token saved before it are still wanted. */
export function leaveKeys(demo) {
  return demo ? [DEMO] : [...EVERYTHING];
}

const UNDRAWN = '<header class="top"><div class="top-row"><h1><span>Panel</span></h1>'
  + '<button type="button" class="refresh" data-refresh>Refresh</button></div></header>'
  + '<p class="notice warn">This page could not be drawn from what the PC sent. '
  + "The other pages may still work; a refresh may put it right.</p>";

/** A page's HTML, or a page that says it could not be drawn. One odd value
 *  in a file must not leave a blank screen that a reload cannot clear. */
export function safely(render) {
  try {
    return render();
  } catch {
    return UNDRAWN;
  }
}

/** A number on its way from `from` to `to`, `t` of the way through its time
 *  (0..1), fast at first and settling - as the panel's numbers count up. */
export function tween(from, to, t) {
  const time = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 1;
  const eased = 1 - (1 - time) ** 3;
  return from + (to - from) * eased;
}

/** Which of `now`'s numbers differ from when they were last seen, as
 *  {key: [was, is]} - and remember them. A redraw moves only these: a value
 *  seen for the first time appears, it does not animate. */
export function changes(seen, now) {
  const out = {};
  for (const [key, value] of Object.entries(now)) {
    if (!Number.isFinite(value)) continue;
    if (seen.has(key) && seen.get(key) !== value) out[key] = [seen.get(key), value];
    seen.set(key, value);
  }
  return out;
}
