// Tasks: each section's ticks and options, drawn from the schema. The two
// halls are both drawn; a narrow screen shows the chosen one, a wide one both.
import { esc } from "../format.js";
import { targetKey } from "../edits.js";
import { control, groups } from "../fields.js";
import { EMPTY, dataOf, pick, plural, rejectedNotices, top } from "./parts.js";

const SPECIAL = "special";

/** One section's cards for the chosen tab. */
export function column(store, view, section) {
  const schema = dataOf(store, "schema");
  const settings = dataOf(store, "settings");
  if (!schema || !settings) return EMPTY;
  const canEdit = store.canEdit();
  const mine = (settings.sections || {})[section] || {};
  const ticks = mine.tasks || {};
  const params = mine.params || {};
  const tabs = schema.tabs || [];
  const tab = tabs.some((t) => t.id === view.tab) ? view.tab : (tabs[0] && tabs[0].id);
  const tasks = (schema.tasks || []).filter((t) =>
    (section === SPECIAL ? t.tab === SPECIAL : t.tab === tab));
  const sameOn = section === "lower" && mine.same_as_high === true;
  const draw = (field, value, kind, args, enabled, idTag = "") =>
    control(field, value, {
      kind, args, pending: store.pending(targetKey(kind, args)), enabled, idTag,
      staged: view.staged instanceof Map ? view.staged.get(targetKey(kind, args)) : undefined,
    });

  let html = "";
  if (section === "lower" && schema.same_as_high)
    html += `<div class="card same">${draw(
      { id: "same_as_high", type: "flag", label: schema.same_as_high.label, help: schema.same_as_high.help },
      mine.same_as_high === true, "set_same_as_high", {}, canEdit)}</div>`;

  const features = [...new Set(tasks.map((t) => t.feature || ""))];
  for (const feature of features) {
    if (features.length > 1 && feature) html += `<h3 class="feature">${esc(feature)}</h3>`;
    for (const task of tasks.filter((t) => (t.feature || "") === feature)) {
      const values = params[task.id] || {};
      let body = draw({ id: task.id, type: "flag", label: task.label, help: task.description },
                      ticks[task.id] === true, "set_tick", { section, task: task.id }, canEdit && !sameOn);
      for (const group of groups(task.params || [])) {
        // A heading that only says its one field's label again is left out.
        const repeats = group.fields.length === 1 && group.fields[0].label === group.heading;
        if (group.heading && !repeats) body += `<h4>${esc(group.heading)}</h4>`;
        for (const field of group.fields)
          body += draw(field, values[field.id], "set_option", { section, task: task.id, option: field.id },
                       canEdit && (!field.depends_on || values[field.depends_on] === true));
      }
      if (task.often && section !== SPECIAL)
        body += draw({ id: "often", type: "choice", label: "How often", choices: schema.often_choices || [] },
                     (settings.how_often || {})[task.id], "set_often", { task: task.id }, canEdit, section);
      const excluded = (task.excludes || []).map((id) => {
        const other = (schema.tasks || []).find((t) => t.id === id);
        return other ? other.label : id;
      });
      if (excluded.length) body += `<p class="row-help">Turns off ${esc(excluded.join(", "))} when on</p>`;
      html += `<article class="card task${ticks[task.id] === true ? "" : " task-off"}">${body}</article>`;
    }
  }
  return html || '<p class="empty">No tasks here</p>';
}

export function render(store, view, now) {
  const schema = dataOf(store, "schema");
  const settings = dataOf(store, "settings");
  const waiting = store.state.edits.length;
  const sections = (schema && schema.sections) || [];
  const section = sections.some((s) => s.id === view.section) ? view.section : (sections[0] && sections[0].id);
  const sub = (waiting ? `<p class="top-sub">${plural(waiting, "change")} pending</p>` : "")
    + (sections.length ? `<div class="picks picks-top">${sections.map((s) =>
      pick("section", s.id, s.label, s.id === section)).join("")}</div>` : "");
  const header = top("Tasks", store, "settings", view, now, sub) + rejectedNotices(store);
  if (!schema || !settings) return header + EMPTY;

  if (section === SPECIAL)
    return `${header}<div class="columns"><section class="col on" data-col="${SPECIAL}">${column(store, view, SPECIAL)}</section></div>`;

  const tabs = schema.tabs || [];
  const tab = tabs.some((t) => t.id === view.tab) ? view.tab : (tabs[0] && tabs[0].id);
  const chips = tabs.map((t) => pick("tab", t.id, t.label, t.id === tab)).join("");
  const columns = sections.filter((s) => s.id !== SPECIAL).map((s) =>
    `<section class="col${s.id === section ? " on" : ""}" data-col="${esc(s.id)}"><h2>${esc(s.label)}</h2>`
    + `${column(store, view, s.id)}</section>`).join("");
  return `${header}<div class="picks">${chips}</div><div class="columns two">${columns}</div>`;
}
