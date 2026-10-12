// The sync repo, through GitHub's Contents API. The only module that holds
// the token, and it sends it to one host.

const API = "https://api.github.com";
// A request that has not answered by now never will, as far as a person
// holding a phone is concerned.
const TIMEOUT_MS = 20000;
const REPO = /^(?!\.+\/)[\w.-]+\/(?!\.+$)[\w.-]+$/;

/** A failure talking to the repo. `kind` is what a page needs to know:
 *  "auth", "missing", "network", "conflict", "rate" or "other". */
export class SyncError extends Error {
  constructor(kind, message) {
    super(message || kind);
    this.name = "SyncError";
    this.kind = kind;
  }
}

function kindOf(response) {
  const { status } = response;
  if (status === 429) return "rate";
  if (status === 403 && response.headers.get("x-ratelimit-remaining") === "0") return "rate";
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "missing";
  if (status === 409 || status === 422) return "conflict";
  return "other";
}

function base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** A client for the repo `owner/name`. */
export function createClient({ repo, token, fetch }) {
  if (!REPO.test(repo || ""))
    throw new SyncError("other", "The repository is written owner/name.");
  const url = (path) =>
    `${API}/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

  async function send(path, init, accept) {
    let response;
    try {
      response = await fetch(url(path), {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...init.headers,
        },
      });
    } catch (error) {
      throw new SyncError("network", String(error && error.message || error));
    }
    return response;
  }

  async function body(response) {
    try {
      return await response.json();
    } catch {
      throw new SyncError("other", "GitHub's answer was not JSON.");
    }
  }

  return {
    /** Resolves if the repository is there for this token; a SyncError says
     *  why not ("missing": no such repository, or one the token cannot see). */
    async check() {
      let response;
      try {
        response = await fetch(`${API}/repos/${repo}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
        });
      } catch (error) {
        throw new SyncError("network", String(error && error.message || error));
      }
      if (!response.ok) throw new SyncError(kindOf(response), `HTTP ${response.status}`);
    },

    /** One file's JSON. With the etag of the copy already held, an unchanged
     *  file comes back as notModified, at no cost to the hourly limit. */
    async readJson(path, etag) {
      const response = await send(path,
        { headers: etag ? { "If-None-Match": etag } : {} },
        "application/vnd.github.raw+json");
      if (response.status === 304) return { data: null, etag, notModified: true };
      if (!response.ok) throw new SyncError(kindOf(response), `${path}: HTTP ${response.status}`);
      return { data: await body(response), etag: response.headers.get("etag"), notModified: false };
    },

    /** The .json files of a folder; none when the folder is not there. */
    async list(path) {
      const response = await send(path, {}, "application/vnd.github+json");
      if (response.status === 404) return [];
      if (!response.ok) throw new SyncError(kindOf(response), `${path}: HTTP ${response.status}`);
      const entries = await body(response);
      if (!Array.isArray(entries)) return [];
      return entries.filter((e) => e && typeof e.name === "string" && e.name.endsWith(".json"))
        .map((e) => ({ name: e.name, sha: e.sha }));
    },

    /** Create a file holding `object`, as one commit. */
    async put(path, object, message) {
      const response = await send(path, {
        method: "PUT",
        body: JSON.stringify({ message, content: base64(JSON.stringify(object, null, 2) + "\n") }),
      }, "application/vnd.github+json");
      if (!response.ok) throw new SyncError(kindOf(response), `${path}: HTTP ${response.status}`);
      const answer = await body(response);
      return { sha: answer && answer.content ? answer.content.sha : null };
    },

    /** Delete the file whose current sha is `sha`, as one commit. */
    async remove(path, sha, message) {
      const response = await send(path, {
        method: "DELETE",
        body: JSON.stringify({ message, sha }),
      }, "application/vnd.github+json");
      if (!response.ok) throw new SyncError(kindOf(response), `${path}: HTTP ${response.status}`);
    },
  };
}
