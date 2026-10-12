// Settings: the panel's groups in the panel's order, then what belongs to
// this device alone.
import { esc } from "../format.js";
import { targetKey } from "../edits.js";
import { control, groups } from "../fields.js";
import { EMPTY, dataOf, plural, rejectedNotices, top } from "./parts.js";

const THEMES = [["device", "Follow device"], ["light", "Light"], ["dark", "Dark"]];

function device(view) {
  const themes = THEMES.map(([value, label]) =>
    `<option value="${value}"${value === view.theme ? " selected" : ""}>${label}</option>`).join("");
  const leave = view.demo
    ? '<button type="button" data-disconnect>Leave the demo</button>'
    : '<a class="button" href="#connect">Replace token</a><button type="button" data-disconnect>Disconnect</button>';
  return '<section class="group"><h2>This device</h2><div class="card">'
    + `<div class="row"><span class="row-label">GitHub connection</span><span class="chip ${view.demo ? "demo-chip" : "ok-chip"}">${view.demo ? "Demo" : "Connected"}</span></div>`
    + `<div class="row"><label class="row-label" for="theme">Theme</label><span class="row-control"><select id="theme" data-theme-pick>${themes}</select></span></div>`
    + `<div class="row actions">${leave}</div>`
    + "</div></section>";
}

export function render(store, view, now) {
  const schema = dataOf(store, "schema");
  const settings = dataOf(store, "settings");
  const header = top("Settings", store, "settings", view, now) + rejectedNotices(store);
  if (!schema || !settings) return header + EMPTY + device(view);

  const canEdit = store.canEdit();
  const values = settings.settings || {};
  const drawn = groups(schema.settings || []).map((group) =>
    `<section class="group">${group.heading ? `<h2>${esc(group.heading)}</h2>` : ""}<div class="card">`
    + group.fields.map((field) => {
      const args = { id: field.id };
      return control(field, values[field.id], {
        kind: "set_setting", args, pending: store.pending(targetKey("set_setting", args)),
        enabled: canEdit && (!field.depends_on || values[field.depends_on] === true),
        staged: view.staged instanceof Map ? view.staged.get(targetKey("set_setting", args)) : undefined,
      });
    }).join("")
    + "</div></section>").join("");
  const locked = (schema.locked_groups || []).map((group) =>
    `<section class="group"><h2>${esc(group.heading)}</h2><div class="card">`
    + `<div class="row off locked"><span class="row-label">Only on the PC · ${plural(Number(group.count) || 0, "setting")}</span></div>`
    + "</div></section>").join("");
  return header + drawn + locked + device(view);
}
