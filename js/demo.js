// The demo: a client with github.js's interface that serves the examples in
// demo/ and keeps edits in memory. Nothing leaves the device, and nothing is
// ever applied - there is no PC behind it.
import { SyncError } from "./github.js";

// The examples were made at one moment; the demo shows them as of a minute ago.
const AGO = 60;

/** Move a pc file's moments so that it was written AGO seconds before `now`. */
function rebase(file, now) {
  if (!file || typeof file.at !== "number" || !file.data) return file;
  const shift = now - AGO - file.at;
  const moved = (value) => (typeof value === "number" ? value + shift : value);
  const data = { ...file.data };
  if ("next_cycle_at" in data) data.next_cycle_at = moved(data.next_cycle_at);
  if ("asleep_until" in data) data.asleep_until = moved(data.asleep_until);
  if (Array.isArray(data.results)) data.results = data.results.map((r) => ({ ...r, at: moved(r.at) }));
  return { ...file, at: file.at + shift, data };
}

export function createDemoClient({ fetch, now = () => Date.now() / 1000 }) {
  const edits = new Map();          // name -> {sha, data}
  let made = 0;
  const editName = (path) => (path.startsWith("edits/") ? path.slice("edits/".length) : null);

  return {
    async check() {},

    async readJson(path) {
      const name = editName(path);
      if (name !== null) {
        if (!edits.has(name)) throw new SyncError("missing", path);
        return { data: edits.get(name).data, etag: null, notModified: false };
      }
      let response;
      try {
        response = await fetch(path.replace(/^pc\//, "demo/"), { cache: "no-store" });
      } catch (error) {
        throw new SyncError("network", String(error && error.message || error));
      }
      if (!response.ok) throw new SyncError(response.status === 404 ? "missing" : "other", path);
      try {
        return { data: rebase(await response.json(), now()), etag: null, notModified: false };
      } catch {
        throw new SyncError("other", `${path} is not JSON.`);
      }
    },

    async list(path) {
      if (path !== "edits") return [];
      return [...edits].map(([name, { sha }]) => ({ name, sha }));
    },

    async put(path, object) {
      const name = editName(path);
      if (name === null) throw new SyncError("other", "The demo only takes edits.");
      const sha = `demo-${++made}`;
      edits.set(name, { sha, data: JSON.parse(JSON.stringify(object)) });
      return { sha };
    },

    async remove(path) {
      const name = editName(path);
      if (name === null || !edits.delete(name)) throw new SyncError("missing", path);
    },
  };
}
