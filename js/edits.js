// An edit: one change to one thing, as contract/sync.md has it.

export const CONTRACT = 1;
export const KINDS = ["set_setting", "set_often", "set_tick", "set_option", "set_same_as_high"];

/** The one thing an edit changes, as a string two edits can be compared by. */
export function targetKey(kind, args = {}) {
  switch (kind) {
    case "set_setting": return `setting:${args.id}`;
    case "set_often": return `often:${args.task}`;
    case "set_tick": return `tick:${args.section}:${args.task}`;
    case "set_option": return `option:${args.section}:${args.task}:${args.option}`;
    case "set_same_as_high": return "same_as_high";
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
