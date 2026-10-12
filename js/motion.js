// What moves, and when. The pages are HTML strings and say nothing of
// motion; this is what is done to the document once one has been drawn.
//
// The rule, as on the panel: a thing moves when the page changes or its value
// does. A redraw that changes nothing moves nothing - so a redraw keeps every
// element that is the same as before (patch), and the stylesheet's
// transitions and running animations carry on undisturbed.
import { amount } from "./format.js";
import { changes, tween } from "./shell.js";

const COUNT_MS = 700;
const ENTER_MS = 1100;
// The backdrop's weather: a dozen seconds, now and again.
const WEATHER_MS = 13500;
const WEATHER_FIRST = 9000;
const WEATHER_GAP = [80000, 130000];
// A control is replaced whole rather than patched: what a person has typed or
// ticked lives in the element, not in its attributes.
const WHOLE = new Set(["INPUT", "SELECT", "TEXTAREA", "OPTION"]);
// What arrives quietly when a later redraw puts it in.
const QUIET = ".card, .chip, .notice, .tile, .row-note";

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const seen = new Map();
let enterTimer = null;

function arrive(node, mark) {
  if (mark && node.nodeType === 1 && node.matches(QUIET)) node.classList.add("fresh");
}

function swap(old, fresh, mark) {
  old.replaceWith(fresh);
  arrive(fresh, mark);
}

/** Whether one can be turned into the other in place: the same kind of
 *  thing, by tag and by class. A card whose class changed - a task that went
 *  from running to done - is a new thing, and arrives. */
function alike(a, b) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (a.nodeType !== 1) return true;
  // by attribute: an SVG element's className is not a string
  const kind = (node) => (node.getAttribute("class") || "").replace(/\s*\bfresh\b/, "");
  return kind(a) === kind(b);
}

/** Make `parent`'s children those of `news`: the ones in the same place and
 *  alike are changed in place, the rest replaced, added or taken away. */
function sync(parent, news, mark) {
  const olds = [...parent.childNodes];
  const shared = Math.min(olds.length, news.length);
  for (let i = 0; i < shared; i += 1) {
    if (alike(olds[i], news[i])) morph(olds[i], news[i], mark);
    else swap(olds[i], news[i], mark);
  }
  for (const gone of olds.slice(shared)) gone.remove();
  for (const added of news.slice(shared)) {
    parent.appendChild(added);
    arrive(added, mark);
  }
}

function morph(old, fresh, mark) {
  if (old.nodeType === 3) {
    if (old.data !== fresh.data) old.data = fresh.data;
    return;
  }
  if (old.nodeType !== 1 || old.isEqualNode(fresh)) return;
  if (WHOLE.has(old.nodeName)) return swap(old, fresh, mark);
  // "style" holds what settle() put there; a page's HTML never has one.
  for (const { name } of [...old.attributes])
    if (name !== "style" && !fresh.hasAttribute(name)) old.removeAttribute(name);
  for (const { name, value } of [...fresh.attributes])
    if (old.getAttribute(name) !== value) old.setAttribute(name, value);
  sync(old, [...fresh.childNodes], mark);
}

/** Make `target` hold `html`, touching only what differs from what it holds. */
export function patch(target, html) {
  try {
    const template = document.createElement("template");
    template.innerHTML = html;
    sync(target, [...template.content.childNodes], true);
  } catch {
    target.innerHTML = html;
  }
}

function countUp(element, from, to) {
  const say = element.dataset.as === "amount" ? amount : (value) => String(Math.round(value));
  const began = performance.now();
  const step = (now) => {
    if (!element.isConnected) return;
    const t = (now - began) / COUNT_MS;
    element.textContent = say(tween(from, to, t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** After a draw: give the bars their length, count up what changed, and - for
 *  a page that has just come up - let it slide into place. */
export function settle(page, route, entering) {
  const fit = () => {
    for (const bar of page.querySelectorAll("[data-progress]"))
      bar.style.setProperty("--p", String(Math.min(1, Math.max(0, Number(bar.dataset.progress) || 0))));
  };
  // A bar that has just arrived grows from nothing; one already there moves on.
  if (entering && !still()) requestAnimationFrame(fit);
  else fit();

  const now = {};
  const counters = [...page.querySelectorAll("[data-count]")];
  counters.forEach((element, i) => { now[`${route}:${i}`] = Number(element.dataset.count); });
  const changed = changes(seen, now);
  if (!still())
    counters.forEach((element, i) => {
      const pair = changed[`${route}:${i}`];
      if (pair) countUp(element, pair[0], pair[1]);
    });

  if (entering) {
    clearTimeout(enterTimer);
    page.classList.remove("enter");
    if (!still()) {
      void page.offsetWidth;          // so the same page coming up again plays again
      page.classList.add("enter");
      enterTimer = setTimeout(() => page.classList.remove("enter"), ENTER_MS);
    }
  }
}

/** Put the menu's pill behind the page on show. */
export function movePill(nav) {
  const pill = nav.querySelector(".nav-pill");
  const on = nav.querySelector('[aria-current="page"]');
  if (!pill) return;
  if (!on) return void pill.style.setProperty("--pill-on", "0");
  const inX = Math.min(14, on.offsetWidth * 0.14);
  pill.style.setProperty("--pill-x", `${on.offsetLeft + inX}px`);
  pill.style.setProperty("--pill-y", `${on.offsetTop + 5}px`);
  pill.style.setProperty("--pill-w", `${on.offsetWidth - 2 * inX}px`);
  pill.style.setProperty("--pill-h", `${on.offsetHeight - 10}px`);
  pill.style.setProperty("--pill-on", "1");
}

/** The backdrop's weather: now and again, while somebody is looking. */
export function startWeather(backdrop) {
  if (!backdrop) return;
  const play = () => {
    if (!document.hidden && !still()) {
      backdrop.classList.add("weather");
      setTimeout(() => backdrop.classList.remove("weather"), WEATHER_MS);
    }
    setTimeout(play, WEATHER_GAP[0] + Math.random() * (WEATHER_GAP[1] - WEATHER_GAP[0]));
  };
  setTimeout(play, WEATHER_FIRST);
}
