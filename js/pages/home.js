// Home: where the PC is, and the run as the panel's Home has it - the count
// tiles, a card per character, the latest happenings.
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

export function render(store, view, now) {
  const live = dataOf(store, "live");
  const schema = dataOf(store, "schema");
  const { mode, text } = pcLine(store.state.files.status, now);
  const progress = live ? `<progress max="1" value="${Math.min(1, Math.max(0, number(live.progress)))}"></progress>` : "";
  const sub = `<p class="pc pc-${mode}"><span class="dot"></span>${esc(text)}</p>${progress}`;
  const header = top("Home", store, live ? "live" : "status", view, now, sub);
  if (!live) return header + EMPTY;

  const totals = live.totals || {};
  const tiles = [
    [`${number(totals.characters_done)}/${number(totals.characters_total)}`, "Done", ""],
    [number(totals.tasks_ok), "Tasks", ""],
    [number(totals.tasks_failed), "Failed", number(totals.tasks_failed) ? " tile-bad" : ""],
    [number(totals.marches), "Marches", ""],
  ].map(([value, label, extra]) => `<div class="tile${extra}"><b>${esc(value)}</b><span>${label}</span></div>`).join("");

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
