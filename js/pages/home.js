// Home: where the PC is, and the run as the panel's Home has it - the dial
// and the bar of the cycle's progress, the count tiles, a card per character,
// the latest happenings.
import { esc, amount, duration, minutesLeft } from "../format.js";
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
  const known = [
    number(who.hall) ? `City Hall ${number(who.hall)}` : "",
    number(who.vip) ? `VIP ${number(who.vip)}` : "",
    number(who.power) ? `${amount(who.power)} power` : "",
  ].filter(Boolean);
  return (known.length ? known : [who.why].filter(Boolean)).map(esc).join(" · ");
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

/** The strip at the foot of a card: research, upgrades. */
function strips(who) {
  const out = [];
  const going = who.research;
  if (going && typeof going === "object") {
    const left = minutesLeft(going.left_minutes);
    out.push(`<div class="strip"><p><span class="strip-k">Research</span> · ${esc(going.text)}${left ? ` · ${left} left` : ""}</p>`
      + (typeof going.fraction === "number" && Number.isFinite(going.fraction)
        ? `<progress class="strip-bar" max="100" value="${Math.round(Math.min(1, Math.max(0, going.fraction)) * 100)}"></progress>` : "")
      + "</div>");
  }
  for (const up of list(who.upgrades)) {
    const left = minutesLeft(up && up.left_minutes);
    out.push(`<div class="strip"><p><span class="strip-k">Upgrade</span> · ${esc(up && up.text)}${left ? ` · ${left} left` : ""}</p></div>`);
  }
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
    + `</div><ul class="who-res">${resources}</ul>`
    + pill(who, ctx)
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
 *  is the stylesheet's and motion.js's business. */
function progress(live, mode) {
  const part = Math.min(1, Math.max(0, number(live.progress)));
  const percent = Math.round(part * 100);
  const dots = (Array.isArray(live.characters) ? live.characters : []).map((who) =>
    `<li class="ms ms-${word(who && who.status, "pending")}" title="${esc(who && who.name)}"></li>`).join("");
  const dial = `<svg class="dial" viewBox="0 0 40 40" role="img" aria-label="${percent}%" data-progress="${part}">`
    + '<circle class="dial-track" cx="20" cy="20" r="15.9155"/>'
    + `<circle class="dial-ring" cx="20" cy="20" r="15.9155" pathLength="100" stroke-dasharray="${percent} 100" transform="rotate(-90 20 20)"/>`
    + `<text x="20" y="20" class="dial-text">${percent}%</text></svg>`;
  const bar = `<div class="mbar${mode === "running" ? " mbar-active" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}" data-progress="${part}">`
    + '<div class="mbar-track"><div class="mbar-fill"></div></div>'
    + `<ol class="mbar-dots">${dots}</ol></div>`;
  return { dial, bar };
}

export function render(store, view, now) {
  const live = dataOf(store, "live");
  const schema = dataOf(store, "schema");
  const { mode, text } = pcLine(store.state.files.status, now);
  const line = `<p class="pc pc-${mode}"><span class="dot"></span>${esc(text)}</p>`;
  if (!live) return top("Home", store, "status", view, now, line) + EMPTY;

  const totals = live.totals || {};
  const { dial, bar } = progress(live, mode);
  const cycle = number(live.cycle)
    ? `<p class="top-sub">Cycle ${number(live.cycle)} · ${number(totals.characters_done)} of ${number(totals.characters_total)} characters</p>` : "";
  const header = top("Home", store, "live", view, now,
    `<div class="hero">${dial}<div class="hero-text">${line}${cycle}</div></div>${bar}`);

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
    + needs(live, view, label)
    + `<section class="cards">${everyone || EMPTY}</section>`
    + (events ? `<h2>Activity</h2><div class="card events"><ul>${events}</ul>${more(view, "events", all.length, EVENTS_SHOWN)}</div>` : "");
}
