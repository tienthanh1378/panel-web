// An edit: one change to one thing, as contract/sync.md has it.

// The version a page writes, and the ones it can read: 2, 3 and 4 added fields
// to `live` only, so a page writes 2 and the PC takes it at 2, 3 or 4. 5 added
// a setting (Chosen characters) a page that does not know it just lists. 6 added
// each character's own farm resource, a task's "Different for Lower Hall" and
// reloading the characters, which a page that does not know them leaves alone
// (the PC refuses an edit to the second section for a task that follows the first).
export const CONTRACT = 2;
export const CONTRACTS = [1, 2, 3, 4, 5, 6];
export const KINDS = ["set_setting", "set_often", "set_tick", "set_option", "set_same_as_high",
  "set_farm_resource", "set_separate", "reload_characters"];

/** The one thing an edit changes, as a string two edits can be compared by. */
export function targetKey(kind, args = {}) {
  switch (kind) {
    case "set_setting": return `setting:${args.id}`;
    case "set_often": return `often:${args.task}`;
    case "set_tick": return `tick:${args.section}:${args.task}`;
    case "set_option": return `option:${args.section}:${args.task}:${args.option}`;
    case "set_same_as_high": return "same_as_high";
    case "set_farm_resource": return `farm_resource:${args.character}`;
    case "set_separate": return `separate:${args.task}`;
    case "reload_characters": return "reload";
    default: throw new Error(`not a kind of edit: ${kind}`);
  }
}

/** What pc/settings.json holds for an edit's target; undefined if nothing. */
export function currentValue(settings, kind, args = {}) {
  const s = settings || {};
  const section = (s.sections || {})[args.section] || {};
  switch (kind) {
    case "set_setting": return (s.settings || {})[args.id];
    case "set_often": return (s.how_often || {})[args.task];
    case "set_tick": return (section.tasks || {})[args.task];
    case "set_option": return ((section.params || {})[args.task] || {})[args.option];
    case "set_same_as_high": return ((s.sections || {}).lower || {}).same_as_high;
    case "set_farm_resource": {
      const pick = (s.farm_resources || {})[args.character];
      return typeof pick === "string" ? pick : "";
    }
    case "set_separate": return (((s.sections || {}).lower || {}).separate || {})[args.task];
    default: return undefined;
  }
}

/** The edit file for a change, carrying the value the page was showing. */
export function makeEdit(kind, args, settings, { id, now, device }) {
  if (!KINDS.includes(kind)) throw new Error(`not a kind of edit: ${kind}`);
  return {
    contract: CONTRACT,
    id,
    kind,
    args: { ...args, seen: currentValue(settings, kind, args) },
    created_at: now,
    device,
  };
}
