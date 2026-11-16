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

const on = (v) => v === true || v === "true" || v === 1;
const num = (v, otherwise = 0) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Math.trunc(Number(v)) : otherwise);
const span = (h, m) => {
  const hours = num(h), minutes = num(m);
  return hours && minutes ? `${hours}h ${minutes}m` : (hours ? `${hours}h` : `${minutes}m`);
};
const clock = (h, m) => `${String(num(h)).padStart(2, "0")}:${String(num(m)).padStart(2, "0")}`;
const WHO = { current: "Current character only", next: "Change 1 character", all: "All characters" };
const GAMES = { first: "First game only", second: "Second game only", both: "Both games" };

/** What a closed group is set to now, in a line; "" when there is nothing to say
 *  (the page then shows what the group is for). */
export function summary(heading, v) {
  const ticked = Array.isArray(v.chosen_characters)
    ? v.chosen_characters.filter((c) => !Array.isArray(c) || c[1]).length : 0;
  switch (heading) {
    case "Characters":
      return v.characters === "chosen" ? `${ticked} chosen` : (WHO[v.characters] || "");
    case "Timer":
      if (!on(v.repeat)) return "Runs once";
      return `Repeats every ${span(v.wait_hours, v.wait_minutes)}`
        + (v.wait_max_hours === undefined && v.wait_max_minutes === undefined ? ""
          : ` to ${span(v.wait_max_hours, v.wait_max_minutes)}`);
    case "Active hours":
      if (on(v.start_at) && on(v.end_at)) return `${clock(v.start_hour, v.start_minute)} to ${clock(v.end_hour, v.end_minute)}`;
      if (on(v.start_at)) return `From ${clock(v.start_hour, v.start_minute)}`;
      if (on(v.end_at)) return `Until ${clock(v.end_hour, v.end_minute)}`;
      return "Any time of day";
    case "Lower Hall":
      return on(v.lower_options) ? "On - a task can be set apart for Lower Hall" : "Off - every task is for all halls";
    case "Run which game":
      return GAMES[v.run_games] || "";
    case "Both games":
      return [on(v.launch_game) ? "Starts a game if needed" : "", on(v.close_game) ? "closes it while waiting" : ""]
        .filter(Boolean).join(", ") || "Left running";
    case "Report time zone":
      return v.report_zone === "utc" ? "UTC days" : (v.report_zone ? "My time zone's days" : "");
    case "Keep history for":
      return v.keep_days === undefined ? "" : `${num(v.keep_days)} days`;
    case "Startup":
      return v.always_admin === undefined ? "" : (on(v.always_admin) ? "Starts as administrator" : "Starts normally");
    case "Screen off": {
      if (on(v.keep_awake_between)) return "Keeps the PC awake between runs";
      const parts = [];
      if (on(v.screen_off_at_end)) parts.push("off after the run");
      if (on(v.screen_off_repeat)) parts.push(`off every ${num(v.screen_off_x, 15)} min`);
      if (on(v.hibernate_cycles)) parts.push("hibernates between cycles");
      const text = parts.join(", ");
      return text ? text[0].toUpperCase() + text.slice(1) : "Screen stays on";
    }
    default:
      return "";
  }
}

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
    const words = summary(group.heading, values) || BRIEFS[group.heading] || "";
    const line = words ? `<p class="brief" data-open="${esc(key)}">${esc(words)}</p>` : "";
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
