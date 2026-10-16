// Home: where the PC is, and the run as the panel's Home has it - the dial
// and the bar of the cycle's progress, the count tiles, a card per character,
// the latest happenings.
import { esc, amount, duration, minutesLeft, clockTime } from "../format.js";
import { pcLine } from "../store.js";
import { EMPTY, dataOf, top } from "./parts.js";

const WORD = { now: "Now", trouble: "Trouble", done: "Done", pending: "To come" };
const RESOURCES = [["food", "Food"], ["wood", "Wood"], ["stone", "Stone"], ["gold", "Gold"]];
// What the panel's Home shows before "Show all".
const NEEDS_SHOWN = 4;
const EVENTS_SHOWN = 4;
const DETAIL_CUT = 90;
// A running time longer than this means the PC's clock is not this device's.
const RUNNING_LONGEST = 6 * 3600;

const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const word = (value, fallback) => (/^[a-z]+$/.test(String(value)) ? String(value) : fallback);
const hhmm = (clock) => String(clock || "").slice(0, 5);
const list = (value) => (Array.isArray(value) ? value : []);

/** "HH:MM:SS" on the PC's clock -> seconds into its day, or null. */
function clockSeconds(clock) {
  const m = /^(\d\d):(\d\d)(?::(\d\d))?$/.exec(String(clock || ""));
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0) : null;
}

/** Seconds from one clock reading to a later one, across midnight if need be. */
function between(from, to) {
  const a = clockSeconds(from);
  const b = clockSeconds(to);
  return a === null || b === null ? null : (b - a + 86400) % 86400;
}

/** The PC's clock at the moment its file was built, taking the PC to be in
 *  this device's zone (the file holds only Unix seconds). */
function clockOf(unixSeconds) {
  if (typeof unixSeconds !== "number") return null;
  const d = new Date(unixSeconds * 1000);
  const two = (n) => String(n).padStart(2, "0");
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

const cut = (text) => (text.length > DETAIL_CUT ? `${text.slice(0, DETAIL_CUT - 1)}…` : text);

/** The words for a task: the schema's, the run's own, or its id. */
function labeller(schema) {
  const tasks = list(schema && schema.tasks);
  return (id, runs = []) => {
    const task = tasks.find((t) => t.id === id);
    const run = runs.find((r) => r.id === id);
    return task ? task.label : (run && run.label) || id;
  };
}

/** Home's order. Contract 2 gives it (`home_order`); a contract 1 file gets
 *  the same by the same rule: the one at work, the one next, the others
 *  latest started first, then those still to come in their order. */
function ordered(live) {
  const everyone = list(live.characters).map((who, i) => ({ who, i }));
  if (Array.isArray(live.home_order)) {
    const at = (name) => { const n = live.home_order.indexOf(name); return n < 0 ? Infinity : n; };
    return everyone.sort((a, b) => at(a.who.name) - at(b.who.name) || a.i - b.i).map(({ who }) => who);
  }
  const first = everyone.find(({ who }) => who.status === "now");
  const next = everyone.find(({ who }) => who.status === "pending");
  const rank = ({ who }) => (who === (first && first.who) ? 0 : who === (next && next.who) ? 1
    : who.status === "pending" ? 3 : 2);
  return everyone.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.i - a.i : a.i - b.i))
    .map(({ who }) => who);
}

/** Row 1, right: "City Hall 25 · VIP 12 · 22.6M power", what is known of it.
 *  A file without those (contract 1) has only the reason it was run. */
function facts(who) {
  // A wide card has the status pill beside these, so there the words are cut
  // down (Hall 11 · VIP 3 · 315.8K); the long form is what a phone shows.
  const known = [
    number(who.hall) ? `<span class="long">City Hall</span><span class="short">Hall</span> ${number(who.hall)}` : "",
    number(who.vip) ? `VIP ${number(who.vip)}` : "",
    number(who.power) ? `${esc(amount(who.power))}<span class="long"> power</span>` : "",
  ].filter(Boolean);
  return (known.length ? known : [who.why].filter(Boolean).map(esc)).join(" · ");
}

/** Row 3: the status as one pill, in the status colour. */
function pill(who, ctx) {
  const runs = list(who.runs);
  const status = word(who.status, "pending");
  let kind = "wait";
  let text = "Waiting";
  if (status === "now") {
    if (ctx.running) {
      kind = "now";
      const doing = [...runs].reverse().find((r) => r.state === "running");
      const spent = between(who.started, ctx.clock);
      text = ["Running", doing && ctx.label(doing.id, runs),
        spent !== null && spent > 0 && spent <= RUNNING_LONGEST ? duration(spent) : ""]
        .filter(Boolean).join(" · ");
    } else {
      kind = "paused";
      text = "Paused";
    }
  } else if (status === "trouble") {
    kind = "trouble";
    const failed = [...runs].reverse().find((r) => r.state === "failed");
    text = failed ? `Problem · ${ctx.label(failed.id, runs)}` : "Problem";
  } else if (status === "done") {
    kind = "done";
    const took = between(who.started, who.finished);
    text = took === null ? "Done" : took < 30 ? "Done · <1 min" : `Done · ${Math.round(took / 60)} min`;
  } else if (ctx.next === who.name) {
    kind = "next";
    text = "Next";
  }
  return `<p class="who-pill pill-${kind}">${esc(text)}</p>`;
}

/** One line of the strip at the foot of a card, with a bar under it when it is
 *  known how far along it is (`fraction`, 0..1). */
function strip(kind, going) {
  const left = minutesLeft(going && going.left_minutes);
  const fraction = going && going.fraction;
  return `<div class="strip"><p><span class="strip-k">${kind}</span> · ${esc(going && going.text)}${left ? ` · ${left} left` : ""}</p>`
    + (typeof fraction === "number" && Number.isFinite(fraction)
      ? `<progress class="strip-bar" max="100" value="${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}"></progress>` : "")
    + "</div>";
}

/** The strip at the foot of a card: research, upgrades. */
function strips(who) {
  const out = [];
  if (who.research && typeof who.research === "object") out.push(strip("Research", who.research));
  for (const up of list(who.upgrades)) out.push(strip("Upgrade", up));
  return out.join("");
}

function card(who, ctx) {
  const status = word(who.status, "pending");
  const held = who.resources || {};
  const gained = who.gained || {};
  const resources = RESOURCES.map(([key, label]) =>
    `<li class="res res-${key}"><img class="res-ico" src="img/res-${key}.png" alt="${label}" width="16" height="16"><b>${esc(amount(held[key]))}</b>`
    + (number(gained[key]) > 0 ? `<small>+${esc(amount(gained[key]))}</small>` : "") + "</li>").join("");
  const known = facts(who);
  return `<article class="card who who-${status}"><div class="who-head">`
    + `<span class="who-name">${esc(who.name)}</span>`
    + (known ? `<span class="who-facts">${known}</span>` : "")
    + pill(who, ctx)
    + `</div><ul class="who-res">${resources}</ul>`
    + strips(who)
    + "</article>";
}

/** "Show all N" / "Show less" for a list cut short; the page keeps which in view.open. */
function more(view, key, total, shown) {
  if (total <= shown) return "";
  const all = view.open && view.open.has(`more:${key}`);
  return `<button type="button" class="link more" data-open="more:${key}">${all ? "Show less" : `Show all ${total}`}</button>`;
}

/** Each task's last go at it, for the characters that have begun: what
 *  failed, then what found nothing to do. */
function needsLook(live) {
  const found = [];
  for (const who of list(live.characters)) {
    const last = new Map();
    for (const run of list(who.runs)) last.set(run.id, run);
    for (const run of last.values())
      if (run.state === "failed" || run.state === "nothing") found.push({ who, run });
  }
  return found.sort((a, b) => (a.run.state === "failed" ? 0 : 1) - (b.run.state === "failed" ? 0 : 1));
}

function needs(live, view, label) {
  const found = needsLook(live);
  const all = Boolean(view.open && view.open.has("more:needs"));
  const rows = (all ? found : found.slice(0, NEEDS_SHOWN)).map(({ who, run }) => {
    const detail = cut(String(run.detail || ""));
    return `<li class="need need-${run.state === "failed" ? "failed" : "nothing"}"><b>${esc(who.name)}</b> `
      + `${esc(label(run.id, list(who.runs)))}${detail ? ` · ${esc(detail)}` : ""}</li>`;
  }).join("");
  return `<section class="card needs${found.length ? "" : " needs-clear"}"><h2>Needs a look · ${found.length || "all clear"}</h2>`
    + (rows ? `<ul>${rows}</ul>` : "") + more(view, "needs", found.length, NEEDS_SHOWN) + "</section>";
}

/** The cycle's progress as the panel shows it: a dial with the number, and a
 *  bar with a dot for each character. Its numbers are set here; how it moves
 *  is the stylesheet's and motion.js's business. While a character is at work
 *  the bar's fill ends on that character's dot (the dots are spread evenly, so
 *  the dot of the one at index i of n is at (i + 0.5) / n), and a line under
 *  the bar says who and how far down the run they are. */
function progress(live, mode) {
  const part = Math.min(1, Math.max(0, number(live.progress)));
  const percent = Math.round(part * 100);
  const everyone = list(live.characters);
  const at = everyone.findIndex((who) => who && who.status === "now");
  const reach = at < 0 ? part : (at + 0.5) / everyone.length;
  const dots = everyone.map((who) =>
    `<li class="ms ms-${word(who && who.status, "pending")}" title="${esc(who && who.name)}"></li>`).join("");
  const dial = `<svg class="dial" viewBox="0 0 40 40" role="img" aria-label="${percent}%" data-progress="${part}">`
    + '<circle class="dial-track" cx="20" cy="20" r="15.9155"/>'
    + `<circle class="dial-ring" cx="20" cy="20" r="15.9155" pathLength="100" stroke-dasharray="${percent} 100" transform="rotate(-90 20 20)"/>`
    + `<text x="20" y="20" class="dial-text">${percent}%</text></svg>`;
  // While running the name is already in the header; stopped or waiting, the line keeps it.
  const where = at < 0 ? ""
    : `<p class="mbar-cap">${mode === "running" ? "" : `${esc(everyone[at].name)} · `}${at + 1} of ${everyone.length}</p>`;
  const bar = `<div class="mbar${mode === "running" ? " mbar-active" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" data-progress="${reach}">`
    + '<div class="mbar-track"><div class="mbar-fill"></div></div>'
    + `<ol class="mbar-dots">${dots}</ol></div>${where}`;
  return { dial, bar };
}

/** "Mon 09:46" / "09:46" on this device's clock, the day part small. */
function when(unixSeconds, now) {
  const m = /^(?:(\w{3}) )?(\d\d:\d\d)$/.exec(clockTime(unixSeconds, now));
  return m ? `${m[1] ? `<small class="next-day">${m[1]}</small> ` : ""}${m[2]}` : "";
}

const countdown = (unixSeconds, now) => {
  const left = Math.ceil((unixSeconds - now) / 60);
  return left > 0 ? `in ${minutesLeft(left)}` : "due now";
};

/** The one thing in Home's header to look at: when the PC starts again, or,
 *  while it runs, who is at work. `line` is what the status line should say,
 *  short where the block says the rest. */
function focus(status, live, mode, now, fallback) {
  const block = (kind, label, value, sub) => `<div class="next next-${kind}"><span class="next-k">${label}</span>`
    + `<b class="next-v">${value}</b>${sub ? `<span class="next-sub">${sub}</span>` : ""}</div>`;
  if (mode === "waiting" && typeof status.next_cycle_at === "number")
    return { html: block("waiting", "Next cycle", when(status.next_cycle_at, now), countdown(status.next_cycle_at, now)), line: "Waiting" };
  if (mode === "asleep" && typeof status.asleep_until === "number")
    return { html: block("asleep", "PC asleep · back at", when(status.asleep_until, now), countdown(status.asleep_until, now)), line: "Asleep" };
  const doing = list(live.characters).find((who) => who && who.status === "now");
  if (mode === "running" && doing) {
    const after = typeof live.next === "string" && live.next ? `Next: ${esc(live.next)}` : "";
    return { html: block("now", "Now", esc(doing.name), after), line: fallback };
  }
  return { html: "", line: fallback };
}

/** What all the characters hold, from each one's last reading, and what they
 *  gathered today. Gems are not on the cards, so not here either. */
function held(live) {
  const sum = (field) => Object.fromEntries(RESOURCES.map(([key]) =>
    [key, list(live.characters).reduce((total, who) => total + number(((who && who[field]) || {})[key]), 0)]));
  const have = sum("resources");
  const gained = sum("gained");
  if (!RESOURCES.some(([key]) => have[key] > 0)) return "";
  const tiles = RESOURCES.map(([key, label]) =>
    `<div class="tile tile-${key}"><img class="tile-ico" src="img/res-${key}.png" alt="${label}" width="22" height="22">`
    + `<b data-count="${have[key]}" data-as="amount">${esc(amount(have[key]))}</b>`
    + (gained[key] > 0 ? `<em class="tile-gain">+${esc(amount(gained[key]))}</em>` : "") + "</div>").join("");
  return `<h2 title="All characters, as last read · green is gathered today">Total resources</h2><div class="tiles tiles-sum tiles-held">${tiles}</div>`;
}

export function render(store, view, now) {
  const live = dataOf(store, "live");
  const schema = dataOf(store, "schema");
  const { mode, text } = pcLine(store.state.files.status, now);
  const status = (store.state.files.status && store.state.files.status.data) || {};
  const line = (words) => `<p class="pc pc-${mode}"><span class="dot"></span>${esc(words)}</p>`;
  if (!live) return top("Home", store, "status", view, now, line(text)) + EMPTY;

  const totals = live.totals || {};
  const { dial, bar } = progress(live, mode);
  const next = focus(status, live, mode, now, text);
  // How long the last finished cycle ran (contract 4), once the PC says it, in
  // minutes as the panel's own Home has it ("took 112 min").
  const ran = number(live.last_cycle_seconds);
  const last = ran > 0 ? ` · last run ${ran < 30 ? "&lt;1" : Math.round(ran / 60)} min` : "";
  const cycle = number(live.cycle)
    ? `<p class="top-sub">Cycle ${number(live.cycle)} · ${number(totals.characters_done)} of ${number(totals.characters_total)} characters${last}</p>` : "";
  const header = top("Home", store, "live", view, now,
    `${next.html}<div class="hero">${dial}<div class="hero-text">${line(next.line)}${cycle}</div></div>${bar}`);

  // [what it shows, its name, its colour, whether it is a plain number that can count up]
  const tiles = [
    [`${number(totals.characters_done)}/${number(totals.characters_total)}`, "Done", "characters", false],
    [number(totals.tasks_ok), "Tasks", "tasks", true],
    [number(totals.tasks_failed), "Failed", number(totals.tasks_failed) ? "failed" : "quiet", true],
    [number(totals.marches), "Marches", "marches", true],
    [number(totals.research), "Research", "research", true],
    [number(totals.upgrades), "Upgrades", "upgrades", true],
  ].map(([value, label, kind, counts]) =>
    `<div class="tile tile-${kind}"><b${counts ? ` data-count="${esc(value)}"` : ""}>${esc(value)}</b><span>${label}</span></div>`).join("");

  const label = labeller(schema);
  const ctx = {
    label, running: mode === "running", clock: clockOf(store.state.files.live.at),
    // contract 2 says who is next; a file of contract 1 does not
    next: typeof live.next === "string" ? live.next
      : (list(live.characters).find((who) => who.status === "pending") || {}).name,
  };
  const everyone = ordered(live).map((who) => card(who, ctx)).join("");

  const all = list(live.events);
  const shown = view.open && view.open.has("more:events") ? all : all.slice(0, EVENTS_SHOWN);
  const events = shown
    .map((e) => `<li class="ev ev-${word(e.kind, "info")}"><time>${esc(hhmm(e.at))}</time> `
      + `<span class="ev-who">${esc(e.who)}</span> ${esc(e.text)}</li>`).join("");

  return header
    + `<div class="tiles tiles-home">${tiles}</div>`
    + held(live)
    + needs(live, view, label)
    + `<section class="cards">${everyone || EMPTY}</section>`
    + (events ? `<h2>Activity</h2><div class="card events"><ul>${events}</ul>${more(view, "events", all.length, EVENTS_SHOWN)}</div>` : "");
}
