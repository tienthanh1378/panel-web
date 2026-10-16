// What every page has: the header with "Updated .. ago", the line that says a refresh
// failed, the edits the PC turned down.
import { esc, clockTime, ago } from "../format.js";

export const EMPTY = '<p class="empty">Nothing from the PC yet</p>';

/** The data of one pc file, or null while there is none. */
export const dataOf = (store, name) => (store.state.files[name] ? store.state.files[name].data : null);

export const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** A chip that is a button: a period, a section, a tab. */
export const pick = (attribute, value, label, chosen) =>
  `<button type="button" class="chip-btn" data-${attribute}="${esc(value)}" aria-pressed="${chosen ? "true" : "false"}">${esc(label)}</button>`;

function notices(store, file, now) {
  const out = [];
  if (!store.supported())
    out.push('<p class="notice warn">Update the page: the PC is sending a newer format. Nothing can be changed until then.</p>');
  const showing = file ? `, showing ${esc(clockTime(file.at, now))}` : "";
  switch (store.state.error) {
    case null: break;
    case "auth":
      out.push('<p class="notice bad">The token was refused. <a href="#connect">Replace it</a></p>');
      break;
    case "rate":
      out.push(`<p class="notice warn">GitHub's hourly limit is used up${showing}.</p>`);
      break;
    default:
      out.push(`<p class="notice warn">Couldn't refresh${showing}.</p>`);
  }
  return out.join("");
}

/** The page's header, and under it whatever is wrong. `name` is the pc file
 *  the page is drawn from; `sub` is HTML that sits in the header. */
export function top(title, store, name, view, now, sub = "") {
  const file = store.state.files[name];
  // An age, not a clock time: Home's header also has the next cycle's time, and
  // two times side by side look like the same thing.
  const asOf = file && typeof file.at === "number"
    ? `<span class="asof" title="${esc(clockTime(file.at, now))}">Updated ${esc(ago(now - file.at))}</span>` : "";
  const demo = view.demo ? '<span class="chip demo-chip">Demo</span>' : "";
  const busy = store.state.busy;
  return `<header class="top"><div class="top-row"><h1><span>${esc(title)}</span></h1>${demo}${asOf}`
    + `<button type="button" class="refresh" data-refresh${busy ? " disabled" : ""}>${busy ? "Refreshing" : "Refresh"}</button>`
    + `</div>${sub}</header>${notices(store, file, now)}`;
}

const UNREADABLE = "An edit that could not be read";

/** What an edit was about, in the panel's words. A result for an edit the PC
 *  could not read has no kind and no args, and anything may be missing. */
export function labelOf(schema, kind, given) {
  const args = given !== null && typeof given === "object" ? given : {};
  const named = (value) => (typeof value === "string" && value ? value : null);
  const tasks = (schema && schema.tasks) || [];
  const task = tasks.find((t) => t && t.id === args.task);
  const taskName = task ? task.label : named(args.task);
  const section = ((schema && schema.sections) || []).find((s) => s && s.id === args.section);
  const where = section ? ` (${section.label})` : "";
  switch (kind) {
    case "set_setting": {
      const field = ((schema && schema.settings) || []).find((f) => f && f.id === args.id);
      return (field && field.label) || named(args.id) || UNREADABLE;
    }
    case "set_often": return taskName ? `${taskName}: how often` : UNREADABLE;
    case "set_tick": return taskName ? `${taskName}${where}` : UNREADABLE;
    case "set_option": {
      const param = task && (task.params || []).find((p) => p && p.id === args.option);
      const option = (param && param.label) || named(args.option);
      return taskName && option ? `${taskName}: ${option}${where}` : UNREADABLE;
    }
    case "set_same_as_high":
      return schema && schema.same_as_high ? schema.same_as_high.label : "Same tasks";
    default:
      return UNREADABLE;
  }
}

/** One notice per edit the PC turned down, until it is dismissed. */
export function rejectedNotices(store) {
  const schema = dataOf(store, "schema");
  return store.rejected().map((result) =>
    `<p class="notice bad"><span>${esc(labelOf(schema, result.kind, result.args))}: not applied. ${esc(result.message)}</span> `
    + `<button type="button" class="link" data-dismiss="${esc(result.id)}">Dismiss</button></p>`).join("");
}
