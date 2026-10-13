// What the page knows: the PC's files, the edits waiting for it, and what
// became of the ones it has handled. Kept on the device between visits, so
// the page opens with the last thing it saw.
import { CONTRACTS, KINDS, makeEdit, targetKey } from "./edits.js";
import { clockTime } from "./format.js";

export const FILES = ["status", "live", "summary", "settings", "schema", "results"];

const CACHE = "panel.cache";
const DISMISSED = "panel.dismissed";
const DISMISSED_KEPT = 300;
// How long past its own deadline the PC may be before it is "not seen".
const GRACE = 900;
// While it runs, the PC writes status at least every ten minutes; three of
// those missed and it is not running any more, whatever the file says.
const RUNNING_STALE = 1800;
// When several requests fail, the one a person can do something about.
const WORST_FIRST = ["auth", "rate", "network", "other"];

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isWrapper = (file) => isObject(file) && isObject(file.data);
const isEdit = (file) => isObject(file) && typeof file.id === "string"
  && KINDS.includes(file.kind) && isObject(file.args);
const worst = (kinds) => WORST_FIRST.find((kind) => kinds.includes(kind))
  || (kinds.length ? "other" : null);

/** Where the PC is, for Home's header. `status` is pc/status.json or null. */
export function pcLine(status, now) {
  if (!isWrapper(status)) return { mode: "none", text: "Nothing from the PC yet" };
  const { state, line = "", next_cycle_at: next, asleep_until: asleep } = status.data;
  const unseen = { mode: "unseen", text: `PC not seen since ${clockTime(status.at, now)}` };
  const late = (deadline) => typeof deadline === "number" && now >= deadline + GRACE;
  switch (state) {
    case "running":
      return typeof status.at === "number" && now - status.at >= RUNNING_STALE
        ? unseen : { mode: "running", text: line };
    case "waiting": return late(next) ? unseen : { mode: "waiting", text: line };
    case "hibernating":
      if (typeof asleep !== "number") return { mode: "asleep", text: line };
      return late(asleep) ? unseen : { mode: "asleep", text: `PC asleep until ${clockTime(asleep, now)}` };
    case "stopped": return { mode: "stopped", text: line };
    default: return { mode: "other", text: line };
  }
}

/** Whether the page should be reading the PC's files by itself: in a session
 *  (`running`, and seen), or once the time the PC said it would be back has
 *  come - it was asleep until then, or waiting for its next cycle - and until
 *  it is "not seen". Before that time nothing can have changed; after the
 *  grace a PC that did not come back is left to the Refresh button. */
export function pcExpected(status, now) {
  const { mode } = pcLine(status, now);
  if (mode === "running") return true;
  if (mode !== "waiting" && mode !== "asleep") return false;
  const { next_cycle_at: next, asleep_until: asleep } = status.data;
  const deadline = mode === "asleep" ? asleep : next;
  return typeof deadline === "number" && now >= deadline;
}

export function createStore({ client, storage, now, newId, device }) {
  const state = {
    files: Object.fromEntries(FILES.map((name) => [name, null])),
    edits: [],
    refreshedAt: null,
    error: null,
    busy: false,
  };
  let etags = {};
  let dismissed = [];
  // Counts refreshes and writes, so a refresh can tell an edit written after
  // it began - which its listing cannot know of - from one the PC has taken.
  let tick = 0;

  const read = (key) => {
    try {
      return JSON.parse(storage.get(key));
    } catch {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      storage.set(key, JSON.stringify(value));
    } catch {
      // A device that will not keep it still shows it; it just starts empty next time.
    }
  };
  const save = () => write(CACHE, {
    files: state.files, etags, refreshedAt: state.refreshedAt,
    edits: state.edits.filter((edit) => edit.sha).map(({ tick: _, ...edit }) => edit),
  });

  const store = {
    state,

    /** What the last visit left on the device. */
    load() {
      const cached = read(CACHE);
      if (isObject(cached)) {
        for (const name of FILES)
          state.files[name] = isObject(cached.files) && isWrapper(cached.files[name])
            ? cached.files[name] : null;
        etags = isObject(cached.etags) ? cached.etags : {};
        state.edits = Array.isArray(cached.edits) ? cached.edits.filter(isEdit) : [];
        state.refreshedAt = typeof cached.refreshedAt === "number" ? cached.refreshedAt : null;
      }
      const ids = read(DISMISSED);
      dismissed = Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : [];
    },

    /** Read the repo. What cannot be read keeps the copy already held. */
    async refresh() {
      state.busy = true;
      const began = ++tick;
      const failures = [];
      const failed = (error) => void failures.push(error && error.kind ? error.kind : "other");

      const readFile = async (name) => {
        try {
          const got = await client.readJson(`pc/${name}.json`, etags[name]);
          if (got.notModified) return;
          state.files[name] = isWrapper(got.data) ? got.data : null;
          etags[name] = got.etag || undefined;
        } catch (error) {
          if (error && error.kind === "missing") {
            state.files[name] = null;
            delete etags[name];
          } else failed(error);
        }
      };

      const readEdits = async () => {
        let entries;
        try {
          entries = await client.list("edits");
        } catch (error) {
          return failed(error);
        }
        const edits = [];
        await Promise.all(entries.map(async ({ name, sha }) => {
          const mine = state.edits.find((edit) => `${edit.id}.json` === name);
          if (mine && mine.sha === sha) return void edits.push(mine);
          try {
            const { data } = await client.readJson(`edits/${name}`);
            if (isEdit(data) && `${data.id}.json` === name) edits.push({ ...data, sha });
          } catch (error) {
            if (!(error && error.kind === "missing")) failed(error);   // missing: taken meanwhile
          }
        }));
        // What the listing does not have is gone - taken by the PC, or
        // cancelled elsewhere - unless it was written after this refresh
        // began, or is being written now.
        const listed = new Set(edits.map((edit) => edit.id));
        for (const edit of state.edits)
          if (!listed.has(edit.id) && (!edit.sha || edit.tick > began)) edits.push(edit);
        state.edits = edits.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
      };

      try {
        await Promise.all([...FILES.map(readFile), readEdits()]);
      } finally {
        state.error = worst(failures);
        if (!state.error) state.refreshedAt = now();
        state.busy = false;
        save();
      }
    },

    /** Ask the PC for one change. Pending from this moment. */
    async submit(kind, args) {
      if (!store.canEdit()) throw new Error("Editing is off.");
      const key = targetKey(kind, args);
      if (store.pending(key)) throw new Error("A change to this is already pending.");
      const edit = makeEdit(kind, args, state.files.settings.data,
                            { id: newId(), now: now(), device });
      const held = { ...edit, sha: null, tick: ++tick };
      state.edits.push(held);
      try {
        const { sha } = await client.put(`edits/${edit.id}.json`, edit,
                                         `edit: ${key} = ${JSON.stringify(args.value)}`);
        held.sha = sha || "written";
        held.tick = ++tick;
        save();
      } catch (error) {
        state.edits = state.edits.filter((other) => other !== held);
        throw error;
      }
    },

    /** Take a pending edit back, if the PC has not got to it first. */
    async cancel(id) {
      const edit = state.edits.find((other) => other.id === id);
      if (!edit || !edit.sha) return;
      try {
        await client.remove(`edits/${id}.json`, edit.sha, `cancel: ${targetKey(edit.kind, edit.args)}`);
      } catch (error) {
        if (!(error && error.kind === "missing")) throw error;
      }
      state.edits = state.edits.filter((other) => other.id !== id);
      save();
    },

    /** The edit waiting on a target, or null. */
    pending(key) {
      return state.edits.find((edit) => targetKey(edit.kind, edit.args) === key) || null;
    },

    /** The edits the PC turned down that have not been dismissed, newest first. */
    rejected() {
      const results = state.files.results && state.files.results.data.results;
      if (!Array.isArray(results)) return [];
      return results
        .filter((r) => isObject(r) && r.status === "rejected" && !dismissed.includes(r.id))
        .sort((a, b) => (b.at || 0) - (a.at || 0));
    },

    dismiss(id) {
      if (dismissed.includes(id)) return;
      dismissed = [...dismissed, id].slice(-DISMISSED_KEPT);
      write(DISMISSED, dismissed);
    },

    /** False when the PC writes a contract this page was not built for. */
    supported() {
      return FILES.every((name) => !state.files[name] || CONTRACTS.includes(state.files[name].contract));
    },

    canEdit() {
      return store.supported() && state.error === null
        && state.files.settings !== null && state.files.schema !== null;
    },
  };
  return store;
}
