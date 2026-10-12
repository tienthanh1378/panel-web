// Home: where the PC is, and the run as the panel's Home has it - the dial
// and the bar of the cycle's progress, the count tiles, a card per character,
// the latest happenings.
import { esc, amount } from "../format.js";
import { pcLine } from "../store.js";
import { EMPTY, dataOf, top } from "./parts.js";

const RANK = { now: 0, trouble: 1, done: 2, pending: 3 };
const WORD = { now: "Now", trouble: "Trouble", done: "Done", pending: "To come" };
const RESOURCES = [["food", "Food"], ["wood", "Wood"], ["stone", "Stone"], ["gold", "Gold"]];
const EVENTS_SHOWN = 10;

const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const word = (value, fallback) => (/^[a-z]+$/.test(String(value)) ? String(value) : fallback);
const hhmm = (clock) => String(clock || "").slice(0, 5);

function card(who, schema) {
  const status = word(who.status, "pending");
  const section = ((schema && schema.sections) || []).find((s) => s.id === who.section);
  const runs = Array.isArray(who.runs) ? who.runs : [];
  const taskLabel = (id) => {
    const task = ((schema && schema.tasks) || []).find((t) => t.id === id);
    const run = runs.find((r) => r.id === id);
    return task ? task.label : (run && run.label) || id;
  };
  const chips = (Array.isArray(who.order) ? who.order : []).map((id) => {
    const run = [...runs].reverse().find((r) => r.id === id);
    const state = run ? word(run.state, "other") : "pending";
    return `<span class="chip run-${state}" title="${esc(run ? run.detail : "")}">${esc(taskLabel(id))}</span>`;
  }).join("");
  const facts = [
    who.why,
    who.started ? `${hhmm(who.started)}${who.finished ? ` to ${hhmm(who.finished)}` : ""}` : "",
    number(who.marches) ? `${number(who.marches)} march${number(who.marches) === 1 ? "" : "es"}` : "",
  ].filter(Boolean).map(esc).join(" · ");
  const failed = runs.filter((r) => r.state === "failed")
    .map((r) => `<p class="who-note">${esc(taskLabel(r.id))}: ${esc(r.detail)}</p>`).join("");
  const held = who.resources || {};
  const resources = RESOURCES.filter(([key]) => number(held[key]))
    .map(([key, label]) => `${label} ${esc(amount(held[key]))}`).join(" · ");
  return `<article class="card who who-${status}"><div class="who-head">`
    + `<span class="who-status">${WORD[status] || esc(who.status)}</span>`
    + `<span class="who-name">${esc(who.name)}</span>`
    + (section ? `<span class="chip sec">${esc(section.label)}</span>` : "")
    + `</div>${facts ? `<p class="who-sub">${facts}</p>` : ""}`
    + (chips ? `<div class="chips">${chips}</div>` : "")
    + failed
    + (resources ? `<p class="who-res">${resources}</p>` : "")
    + "</article>";
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
  ].map(([value, label, kind, counts]) =>
    `<div class="tile tile-${kind}"><b${counts ? ` data-count="${esc(value)}"` : ""}>${esc(value)}</b><span>${label}</span></div>`).join("");

  const everyone = (Array.isArray(live.characters) ? live.characters : [])
    .map((who, i) => ({ who, i, rank: RANK[who.status] ?? RANK.pending }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(({ who }) => card(who, schema)).join("");

  const events = (Array.isArray(live.events) ? live.events : []).slice(0, EVENTS_SHOWN)
    .map((e) => `<li class="ev ev-${word(e.kind, "info")}"><time>${esc(hhmm(e.at))}</time> `
      + `<span class="ev-who">${esc(e.who)}</span> ${esc(e.text)}</li>`).join("");

  return header
    + `<div class="tiles">${tiles}</div>`
    + `<section class="cards">${everyone || EMPTY}</section>`
    + (events ? `<h2>Activity</h2><ul class="events card">${events}</ul>` : "");
}
