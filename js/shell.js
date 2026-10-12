// The shell's decisions that need no document, so they can be tested.

const DEMO = "panel.demo";
const EVERYTHING = ["panel.repo", "panel.token", "panel.cache", "panel.dismissed", DEMO];

/** What leaving forgets. Leaving the demo forgets only that it was on: the
 *  repository and the token saved before it are still wanted. */
export function leaveKeys(demo) {
  return demo ? [DEMO] : [...EVERYTHING];
}

const UNDRAWN = '<header class="top"><div class="top-row"><h1>Panel</h1>'
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
