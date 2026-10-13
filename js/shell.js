// The shell's decisions that need no document, so they can be tested.

const DEMO = "panel.demo";
const EVERYTHING = ["panel.repo", "panel.token", "panel.cache", "panel.dismissed", "panel.connectedAt", DEMO];

/** A device is asked for the token again this long after it connected. It is
 *  the device forgetting, not GitHub refusing: the token itself lasts as long
 *  as it was made to on GitHub. */
export const SESSION_DAYS = 30;
const SESSION = SESSION_DAYS * 86400;
// A device clock an hour out is nothing; one that says it connected days
// from now has been set back, and is not believed.
const CLOCK_SLACK = 3600;

/** What goes when the month is up: the token and what was read with it. The
 *  repository's name stays, so only the token has to be typed again. */
export const EXPIRED_KEYS = ["panel.token", "panel.cache", "panel.dismissed", "panel.connectedAt"];

/** Whether a device that connected at `connectedAt` must connect again. With
 *  no record of when, it must. */
export function sessionOver(connectedAt, now) {
  if (typeof connectedAt !== "number" || !Number.isFinite(connectedAt)) return true;
  if (connectedAt - now > CLOCK_SLACK) return true;
  return now - connectedAt >= SESSION;
}

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

// Never twice within this many seconds, whatever the reason.
const RELOAD_GAP = 60;

/** Whether the page should reload itself now that a new version has taken
 *  over. Not on a first visit (nothing was replaced), not while somebody is
 *  in a field or has a list rearranged and not sent, and not in a loop.
 *  Told nothing, it does nothing. */
export function mayReload({ hadController = false, editing = true, staged = 1, sinceLast = 0 } = {}) {
  return hadController && !editing && staged === 0 && sinceLast > RELOAD_GAP;
}

// A new version is looked for when the page is opened - and a Home Screen app
// is not opened again when it is only brought back from the background, so it
// is looked for then too, and now and then while it stays in view. Not more
// often than this many seconds.
const CHECK_GAP = 300;

// While the page is in view it reads the repo again by itself, this many
// seconds after the last read. Reads are conditional, so a file the PC has not
// changed costs nothing.
const POLL_GAP = 60;

/** Whether the page should read the repo again by itself now: only while it is
 *  in view and nobody is in a field. Told nothing, it does nothing. */
export function mayPoll({ visible = false, editing = true, sinceLast = 0 } = {}) {
  return visible === true && editing === false && sinceLast >= POLL_GAP;
}

/** Whether the page should ask for a new version now. */
export function mayCheck({ visible = false, sinceLast = 0 } = {}) {
  return visible === true && sinceLast > CHECK_GAP;
}
