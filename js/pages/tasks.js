// Tasks: each task's ticks and options, drawn from the schema. A card is its
// title, its switch and one line of what it does until it is tapped; then it
// opens (view.open) to the description and the options.
//
// Until the PC says which tasks have a Lower Hall of their own (contract 6,
// settings.sections.lower.separate) the two halls are both drawn, a narrow
// screen showing the chosen one and a wide one both. From then on a task is
// one card for both halls - "All halls" - and gives Lower Hall a switch and
// options of its own only when its "Different for Lower Hall" is on.
import { esc } from "../format.js";
import { targetKey } from "../edits.js";
import { control, groups } from "../fields.js";
import { EMPTY, dataOf, pick, plural, rejectedNotices, top } from "./parts.js";

const SPECIAL = "special";
const HIGH = "high";
const LOWER = "lower";

/** Whether the PC says, per task, if Lower Hall has its own config (contract 6). */
export function knowsSeparate(settings) {
  const flags = (((settings || {}).sections || {})[LOWER] || {}).separate;
  return flags !== null && typeof flags === "object" && !Array.isArray(flags);
}

const isOpen = (view, key) => Boolean(view.open instanceof Set && view.open.has(key));

/** The line a closed card shows: what the task does; the page cuts it to fit. */
const brief = (text, key) =>
  (text ? `<p class="brief" data-open="${esc(key)}">${esc(text)}</p>` : "");

const chevron = (key, open) =>
  `<button type="button" class="chev" data-open="${esc(key)}" aria-expanded="${open ? "true" : "false"}" `
  + `aria-label="${open ? "Hide" : "Show"} the details">${open ? "▾" : "▸"}</button>`;

/** The per-character pick of what to farm: a row for each character of the account. */
function perCharacter(store, schema, settings, canEdit, draw) {
  const words = schema.farm_resource;
  const people = Array.isArray(schema.characters) ? schema.characters : [];
  if (!words || !people.length) return "";
  const picks = settings.farm_resources || {};
  const choices = [["", words.none || ""], ...(words.choices || [])];
  const reloading = store.pending("reload");
  let html = `<h4>${esc(words.label)}</h4>`;
  if (words.help) html += `<p class="row-help">${esc(words.help)}</p>`;
  html += `<div class="chars">${people.map((c) => draw(
    { id: `char-${c.id}`, type: "choice", label: c.name, choices },
    typeof picks[c.id] === "string" ? picks[c.id] : "", "set_farm_resource", { character: c.id }, canEdit)).join("")}</div>`;
  html += `<p class="row-actions"><button type="button" class="link" data-reload${canEdit && !reloading ? "" : " disabled"}>`
    + `${reloading ? "Reloading characters" : "Reload characters"}</button></p>`;
  return html;
}

/** One section's cards for the chosen tab. `merged`: the cards of both halls
 *  in one (the section is then "high"). */
export function column(store, view, section, merged = false) {
  const schema = dataOf(store, "schema");
  const settings = dataOf(store, "settings");
  if (!schema || !settings) return EMPTY;
  const canEdit = store.canEdit();
  const sections = settings.sections || {};
  const tabs = schema.tabs || [];
  const tab = tabs.some((t) => t.id === view.tab) ? view.tab : (tabs[0] && tabs[0].id);
  const tasks = (schema.tasks || []).filter((t) =>
    (section === SPECIAL ? t.tab === SPECIAL : t.tab === tab));
  const sameOn = (merged || section === LOWER) && (sections[LOWER] || {}).same_as_high === true;
  const flags = (sections[LOWER] || {}).separate || {};
  // The halls' names are the PC's (schema.sections), not this page's.
  const named = (id, otherwise) => ((schema.sections || []).find((s) => s.id === id) || {}).label || otherwise;
  const first = named(HIGH, "First");
  const second = named(LOWER, "Second");
  const draw = (field, value, kind, args, enabled, idTag = "") =>
    control(field, value, {
      kind, args, pending: store.pending(targetKey(kind, args)), enabled, idTag,
      staged: view.staged instanceof Map ? view.staged.get(targetKey(kind, args)) : undefined,
    });

  /** The options of a task for one section. */
  const options = (task, sec, label = "") => {
    const values = ((sections[sec] || {}).params || {})[task.id] || {};
    let body = label ? `<h4 class="half">${esc(label)}</h4>` : "";
    for (const group of groups(task.params || [])) {
      // A heading that only says its one field's label again is left out.
      const repeats = group.fields.length === 1 && group.fields[0].label === group.heading;
      if (group.heading && !repeats) body += `<h4>${esc(group.heading)}</h4>`;
      for (const field of group.fields)
        body += draw(field, values[field.id], "set_option", { section: sec, task: task.id, option: field.id },
                     canEdit && (!field.depends_on || values[field.depends_on] === true));
    }
    return body;
  };

  let html = "";
  const sameCard = () => (schema.same_as_high
    ? `<div class="card same">${draw(
      { id: "same_as_high", type: "flag", label: schema.same_as_high.label, help: schema.same_as_high.help },
      (sections[LOWER] || {}).same_as_high === true, "set_same_as_high", {}, canEdit)}</div>` : "");
  if (merged ? section === HIGH : section === LOWER) html += sameCard();

  const features = [...new Set(tasks.map((t) => t.feature || ""))];
  for (const feature of features) {
    if (features.length > 1 && feature) html += `<h3 class="feature">${esc(feature)}</h3>`;
    for (const task of tasks.filter((t) => (t.feature || "") === feature)) {
      const ticks = (sections[section] || {}).tasks || {};
      const separate = merged && flags[task.id] === true;
      const key = merged ? `card:${task.id}` : `card:${section}:${task.id}`;
      const open = isOpen(view, key);
      const lowerTicks = (sections[LOWER] || {}).tasks || {};
      // The title row is the task's switch: for both halls, or for the first one
      // when Lower Hall has a row of its own under it.
      let heads = draw({ id: task.id, type: "flag", label: separate ? `${task.label} (${first})` : task.label },
                       ticks[task.id] === true, "set_tick", { section, task: task.id }, canEdit && !(section === LOWER && sameOn));
      if (separate)
        heads += draw({ id: `${task.id}-lower`, type: "flag", label: "Lower Hall" },
                      lowerTicks[task.id] === true, "set_tick", { section: LOWER, task: task.id }, canEdit && !sameOn);
      let body = task.description ? `<p class="row-help">${esc(task.description)}</p>` : "";
      if (merged && schema.separate)
        body += draw({ id: `${task.id}-separate`, type: "flag", label: schema.separate.label, help: schema.separate.help },
                     separate, "set_separate", { task: task.id }, canEdit);
      body += merged
        ? (separate ? options(task, HIGH, first) + options(task, LOWER, second)
          : options(task, HIGH, "All halls"))
        : options(task, section);
      if (task.often && section !== SPECIAL)
        body += draw({ id: "often", type: "choice", label: "How often", choices: schema.often_choices || [] },
                     (settings.how_often || {})[task.id], "set_often", { task: task.id }, canEdit, section);
      const excluded = (task.excludes || []).map((id) => {
        const other = (schema.tasks || []).find((t) => t.id === id);
        return other ? other.label : id;
      });
      if (excluded.length) body += `<p class="row-help">Turns off ${esc(excluded.join(", "))} when on</p>`;
      if (merged && task.id === "farm") body += perCharacter(store, schema, settings, canEdit, draw);
      html += `<article class="card task${ticks[task.id] === true || (separate && lowerTicks[task.id] === true) ? "" : " task-off"}${open ? " open" : ""}">`
        + `<div class="task-head">${chevron(key, open)}<div class="task-switches">${heads}</div></div>`
        + `${brief(task.description, key)}<div class="task-body"${open ? "" : " hidden"}>${body}</div></article>`;
    }
  }
  return html || '<p class="empty">No tasks here</p>';
}

export function render(store, view, now) {
  const schema = dataOf(store, "schema");
  const settings = dataOf(store, "settings");
  const waiting = store.state.edits.length;
  const merged = Boolean(schema && settings && knowsSeparate(settings));
  // Merged: one list for both halls, so no chip for the second.
  const sections = ((schema && schema.sections) || []).filter((s) => !merged || s.id !== LOWER)
    .map((s) => (merged && s.id === HIGH ? { ...s, label: "Hall tasks" } : s));
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
  if (merged)
    return `${header}<div class="picks">${chips}</div><div class="columns"><section class="col on" data-col="${HIGH}">`
      + `${column(store, view, HIGH, true)}</section></div>`;
  const columns = sections.filter((s) => s.id !== SPECIAL).map((s) =>
    `<section class="col${s.id === section ? " on" : ""}" data-col="${esc(s.id)}"><h2>${esc(s.label)}</h2>`
    + `${column(store, view, s.id)}</section>`).join("");
  return `${header}<div class="picks">${chips}</div><div class="columns two">${columns}</div>`;
}
