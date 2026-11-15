// Settings: the panel's groups in the panel's order, then what belongs to
// this device alone.
import { esc } from "../format.js";
import { targetKey } from "../edits.js";
import { control, groups } from "../fields.js";
import { EMPTY, dataOf, plural, rejectedNotices, top } from "./parts.js";

const THEMES = [["device", "Follow device"], ["light", "Light"], ["dark", "Dark"]];

// What a group is for, in a line: shown under its heading while it is closed
// (a card opens on a tap), cut to fit. A heading with none shows only its name.
const BRIEFS = {
  Characters: "Which characters run, and who is ticked.",
  Timer: "How long to wait between cycles.",
  "Active hours": "Only work between these times of day.",
  "Run which game": "Which game or games to run.",
  "Both games": "Starting and closing the game for a run.",
  "Report time zone": "The time zone the daily report counts in.",
  "Keep history for": "How many days of history are kept.",
  Startup: "How the panel starts.",
  "Screen off": "Turn the screen off after a run, and keep the PC awake between runs.",
  Discord: "Messages and commands through Discord.",
  "Web sync": "Show the panel on this page and take its changes back.",
};

const chevron = (key, open) =>
  `<button type="button" class="chev" data-open="${esc(key)}" aria-expanded="${open ? "true" : "false"}" `
  + `aria-label="${open ? "Hide" : "Show"} the details">${open ? "▾" : "▸"}</button>`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Connected until 11 Nov": the day this device is asked for the token again. */
function connection(view) {
  if (view.demo) return "Demo";
  const ends = view.sessionEnds;
  if (typeof ends !== "number" || !Number.isFinite(ends)) return "Connected";
  const day = new Date(ends * 1000);
  return `Connected until ${day.getDate()} ${MONTHS[day.getMonth()]}`;
}

function device(view) {
  const themes = THEMES.map(([value, label]) =>
    `<option value="${value}"${value === view.theme ? " selected" : ""}>${label}</option>`).join("");
  const leave = view.demo
    ? '<button type="button" data-disconnect>Leave the demo</button>'
    : '<a class="button" href="#connect">Replace token</a><button type="button" data-disconnect>Disconnect</button>';
  return '<section class="group"><h2>This device</h2><div class="card">'
    + `<div class="row"><span class="row-label">GitHub connection</span><span class="chip ${view.demo ? "demo-chip" : "ok-chip"}">${connection(view)}</span></div>`
    + `<div class="row"><label class="row-label" for="theme">Theme</label><span class="row-control"><select id="theme" data-theme-pick>${themes}</select></span></div>`
    + `<div class="row actions">${leave}</div>`
    + "</div></section>";
}

/** Make the PC's lists of characters again (contract 6). */
function reload(store, canEdit) {
  const waiting = store.pending("reload");
  return '<div class="row actions"><button type="button" data-reload'
    + `${canEdit && !waiting ? "" : " disabled"}>${waiting ? "Reloading characters" : "Reload characters"}</button></div>`;
}

export function render(store, view, now) {
  const schema = dataOf(store, "schema");
  const settings = dataOf(store, "settings");
  const header = top("Settings", store, "settings", view, now) + rejectedNotices(store);
  if (!schema || !settings) return `${header}<div class="groups">${EMPTY}${device(view)}</div>`;

  const canEdit = store.canEdit();
  const values = settings.settings || {};
  const open = (key) => Boolean(view.open instanceof Set && view.open.has(key));
  const drawn = groups(schema.settings || []).map((group) => {
    const key = `set:${group.heading}`;
    const shown = open(key);
    const line = BRIEFS[group.heading] ? `<p class="brief" data-open="${esc(key)}">${esc(BRIEFS[group.heading])}</p>` : "";
    return `<section class="group fold${shown ? " open" : ""}">`
    + (group.heading ? `<div class="fold-head" data-open="${esc(key)}">${chevron(key, shown)}<h2>${esc(group.heading)}</h2></div>${line}` : "")
    + `<div class="card fold-body"${shown || !group.heading ? "" : " hidden"}>`
    + group.fields.map((field) => {
      const args = { id: field.id };
      return control(field, values[field.id], {
        kind: "set_setting", args, pending: store.pending(targetKey("set_setting", args)),
        enabled: canEdit && (!field.depends_on || values[field.depends_on] === true),
        staged: view.staged instanceof Map ? view.staged.get(targetKey("set_setting", args)) : undefined,
      });
    }).join("")
    + (group.heading === "Characters" && Array.isArray(schema.characters) ? reload(store, canEdit) : "")
    + "</div></section>";
  }).join("");
  const locked = (schema.locked_groups || []).map((group) =>
    `<section class="group"><h2>${esc(group.heading)}</h2><div class="card">`
    + `<div class="row off locked"><span class="row-label">Only on the PC · ${plural(Number(group.count) || 0, "setting")}</span></div>`
    + "</div></section>").join("");
  return `${header}<div class="groups">${drawn}${locked}${device(view)}</div>`;
}
