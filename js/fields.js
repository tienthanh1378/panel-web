// A control's HTML from a schema field. The page draws every setting and task
// option through here, so a field added on the PC needs nothing new on the page.
import { esc } from "./format.js";
import { targetKey } from "./edits.js";

// A picker's range is drawn as a list while it is short enough to scroll.
const LONGEST_PICKER = 200;

const isPair = (item) => Array.isArray(item) && item.length === 2
  && typeof item[0] === "string" && typeof item[1] === "boolean";

/** A priority value if it is this field's list, otherwise the field's default. */
function listOf(field, value) {
  const items = Array.isArray(field.items) ? field.items : [];
  const fits = (list) => Array.isArray(list) && list.length === items.length && list.every(isPair)
    && items.every((name) => list.some((pair) => pair[0] === name));
  if (fits(value)) return value;
  if (fits(field.default)) return field.default;
  return items.map((name) => [name, false]);
}

const picked = (field, n) => (field.picker ? String(field.picker).replace("{n}", n) : String(n));

/** A value as its control reads: "on", a choice's label, a picked number,
 *  the ticked names of a list. */
export function shown(field, value) {
  if (value === undefined || value === null) return "-";
  switch (field.type) {
    case "flag": return value ? "on" : "off";
    case "choice": {
      const choice = (field.choices || []).find(([v]) => v === value);
      return choice ? String(choice[1]) : String(value);
    }
    case "number": return picked(field, value);
    case "priority": {
      const ticked = listOf(field, value).filter(([, on]) => on).map(([name]) => name);
      return ticked.length ? ticked.join(", ") : "none";
    }
    default: return typeof value === "string" ? value : JSON.stringify(value);
  }
}

/** What a control gave, as the value its field takes: {value} or {error}. */
export function coerce(type, raw, field) {
  switch (type) {
    case "flag":
      return typeof raw === "boolean" ? { value: raw } : { error: "On or off" };
    case "number": {
      const range = `${field.min} to ${field.max}`;
      const text = typeof raw === "number" ? String(raw) : String(raw ?? "").trim();
      if (!/^-?\d+$/.test(text)) return { error: `A whole number, ${range}` };
      const number = Number(text);
      return number >= field.min && number <= field.max ? { value: number } : { error: range };
    }
    case "choice":
      return (field.choices || []).some(([v]) => v === raw)
        ? { value: raw } : { error: "Not one of the choices" };
    case "priority": {
      const items = Array.isArray(field.items) ? field.items : [];
      const fits = Array.isArray(raw) && raw.length === items.length && raw.every(isPair)
        && items.every((name) => raw.some((pair) => pair[0] === name));
      return fits ? { value: raw } : { error: "The list does not match" };
    }
    default:
      return { error: "This cannot be changed here" };
  }
}

/** The field an edit's value must fit, or null when the schema has none. */
export function fieldFor(schema, kind, args = {}) {
  if (!schema) return null;
  const task = (schema.tasks || []).find((t) => t.id === args.task);
  switch (kind) {
    case "set_setting": return (schema.settings || []).find((f) => f.id === args.id) || null;
    case "set_option": return (task && (task.params || []).find((f) => f.id === args.option)) || null;
    case "set_often": return { type: "choice", choices: schema.often_choices || [] };
    case "set_tick":
    case "set_same_as_high": return { type: "flag" };
    default: return null;
  }
}

/** Consecutive fields under one heading, in order. */
export function groups(fields) {
  const out = [];
  for (const field of fields) {
    const heading = field.heading || "";
    const last = out[out.length - 1];
    if (last && last.heading === heading) last.fields.push(field);
    else out.push({ heading, fields: [field] });
  }
  return out;
}

/** One row: the label, the control, and what is pending on it.
 *  opts: {kind, args, pending, enabled, idTag, staged}. idTag tells two
 *  controls for the same target apart when a page draws both. staged is a
 *  priority list rearranged on this device and not sent yet: a list takes
 *  several moves to put right, and each edit waits for the PC. */
export function control(field, value, { kind, args, pending = null, enabled = true, idTag = "", staged }) {
  const key = targetKey(kind, args);
  const id = `f-${`${key} ${idTag}`.trim().replace(/[^\w]+/g, "-")}`;
  const live = enabled && field.editable !== false && !pending;
  const carries = enabled && field.editable !== false;
  const edit = carries
    ? ` data-kind="${esc(kind)}" data-args="${esc(JSON.stringify(args))}" data-type="${esc(field.type)}"`
    : "";
  const off = live ? "" : " disabled";
  const working = live && field.type === "priority" && Array.isArray(staged);
  const current = pending ? pending.args.value : working ? staged : value;
  const label = esc(field.prefix ? `${field.prefix} ${field.label}` : field.label);

  let body;
  switch (field.type) {
    case "flag":
      body = `<input id="${id}" class="switch" type="checkbox" role="switch"${edit}${current ? " checked" : ""}${off}>`;
      break;
    case "choice":
      body = `<select id="${id}"${edit}${off}>${(field.choices || []).map(([v, text]) =>
        `<option value="${esc(v)}"${v === current ? " selected" : ""}>${esc(text)}</option>`).join("")}</select>`;
      break;
    case "number": {
      const drawn = field.picker && Number.isInteger(field.min) && Number.isInteger(field.max)
        && field.max - field.min < LONGEST_PICKER;
      if (drawn) {
        let options = "";
        for (let n = field.min; n <= field.max; n += 1)
          options += `<option value="${n}"${n === current ? " selected" : ""}>${esc(picked(field, n))}</option>`;
        body = `<select id="${id}"${edit}${off}>${options}</select>`;
      } else {
        body = `<input id="${id}" type="number" inputmode="numeric" step="1" min="${esc(field.min)}" max="${esc(field.max)}" value="${esc(current)}"${edit}${off}>`;
      }
      break;
    }
    case "priority": {
      const list = listOf(field, current);
      body = `<ol id="${id}" class="priority"${edit}>${list.map(([name, on], i) =>
        `<li data-name="${esc(name)}"><label><input type="checkbox" data-item${on ? " checked" : ""}${off}> ${esc(name)}</label>`
        + `<button type="button" data-move="up" aria-label="Move ${esc(name)} up"${off || (i === 0 ? " disabled" : "")}>&uarr;</button>`
        + `<button type="button" data-move="down" aria-label="Move ${esc(name)} down"${off || (i === list.length - 1 ? " disabled" : "")}>&darr;</button></li>`).join("")}</ol>`;
      break;
    }
    default:
      return `<div class="row off" data-key="${esc(key)}"><span class="row-label">${label}</span>`
        + `<span class="row-value">${esc(shown(field, value))}</span></div>`;
  }

  let note = "";
  if (pending)
    note = `<p class="row-note"><span class="chip pending-chip">Pending</span> Was ${esc(shown(field, pending.args.seen))}. `
      + `<button type="button" class="link" data-cancel="${esc(pending.id)}">Cancel</button></p>`;
  else if (working)
    note = '<p class="row-note">Not sent yet. <button type="button" class="link" data-send>Send</button> '
      + '<button type="button" class="link" data-reset>Reset</button></p>';
  const help = field.help ? `<p class="row-help">${esc(field.help)}</p>` : "";
  const classes = ["row", `row-${esc(field.type)}`, pending ? "pending" : "", working ? "staged" : "", live ? "" : "off"]
    .filter(Boolean).join(" ");
  return `<div class="${classes}" data-key="${esc(key)}">`
    + `<label class="row-label" for="${id}">${label}</label>`
    + `<span class="row-control">${body}</span>${note}${help}<p class="row-error" hidden></p></div>`;
}
