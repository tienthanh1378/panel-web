// The shell: which page is showing, what a tap does, when the repo is read.
// Everything it draws comes from the page modules as HTML; this is the only
// module that touches the document.
import { createClient } from "./github.js";
import { createDemoClient } from "./demo.js";
import { createStore } from "./store.js";
import { coerce, fieldFor } from "./fields.js";
import { leaveKeys, safely } from "./shell.js";
import * as home from "./pages/home.js";
import * as summary from "./pages/summary.js";
import * as tasks from "./pages/tasks.js";
import * as settings from "./pages/settings.js";
import * as connect from "./pages/connect.js";

const PAGES = { home, summary, tasks, settings };
const THEMES = ["device", "light", "dark"];
// Coming back to the page reads the repo again, but not more often than this.
const REFRESH_GAP = 15;
const TOAST_MS = 4000;

// Private windows refuse storage; the page then works for the visit only.
const keep = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* not kept */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* nothing to remove */ }
  },
};

const page = document.getElementById("page");
const toastBox = document.getElementById("toast");
const now = () => Date.now() / 1000;
const view = {
  period: "today", section: "high", tab: "", open: new Set(),
  theme: THEMES.includes(keep.get("panel.theme")) ? keep.get("panel.theme") : "device",
  demo: false, connectError: "", repo: keep.get("panel.repo") || "",
  connected: false,
  // Priority lists rearranged here and not sent yet, by target.
  staged: new Map(),
};
let store = null;
let lastRefresh = 0;
let toastTimer = null;

function deviceName() {
  const agent = navigator.userAgent || "";
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Macintosh/.test(agent)) return "Mac";
  return "Browser";
}

function toast(message) {
  toastBox.textContent = message;
  toastBox.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastBox.hidden = true; }, TOAST_MS);
}

function applyTheme() {
  if (view.theme === "device") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = view.theme;
}

function route() {
  const name = location.hash.replace(/^#/, "");
  if (name === "connect" || !store) return "connect";
  return PAGES[name] ? name : "home";
}

function draw() {
  const name = route();
  const focused = document.activeElement && document.activeElement.id;
  document.body.classList.toggle("connecting", name === "connect");
  view.connected = Boolean(store);
  page.innerHTML = safely(() =>
    (name === "connect" ? connect.render(store, view, now()) : PAGES[name].render(store, view, now())));
  for (const link of document.querySelectorAll("[data-nav]")) {
    if (link.dataset.nav === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (focused) {
    const again = document.getElementById(focused);
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }
}

async function refresh() {
  if (!store || store.state.busy) return;
  lastRefresh = now();
  const reading = store.refresh();
  draw();
  await reading;
  draw();
}

function open(client, demo) {
  view.demo = demo;
  store = createStore({
    client, storage: demo ? { get: () => null, set() {}, remove() {} } : keep,
    now, newId: () => crypto.randomUUID(), device: deviceName(),
  });
  store.load();
}

/** Open what this device has saved: the demo, or a repository and its token. */
function openSaved() {
  const repo = keep.get("panel.repo");
  const token = keep.get("panel.token");
  store = null;
  view.demo = false;
  view.repo = repo || "";
  if (keep.get("panel.demo") === "1") open(createDemoClient({ fetch: (url, init) => fetch(url, init) }), true);
  else if (repo && token) {
    try {
      open(createClient({ repo, token, fetch: (url, init) => fetch(url, init) }), false);
    } catch {
      store = null;
    }
  }
}

function start() {
  applyTheme();
  openSaved();
  draw();
  refresh();
}

/** Disconnect, or leave the demo - which goes back to what was connected. */
function leave() {
  for (const key of leaveKeys(view.demo)) keep.remove(key);
  view.connectError = "";
  view.staged.clear();
  openSaved();
  location.hash = store ? "#settings" : "#connect";
  draw();
  refresh();
}

async function connectWith(repo, token) {
  view.repo = repo;
  let client;
  try {
    client = createClient({ repo, token, fetch: (url, init) => fetch(url, init) });
    if (!token) throw Object.assign(new Error(), { kind: "auth" });
    await client.check();
  } catch (error) {
    view.connectError = {
      auth: "The token was refused. Check it covers this repository, with Contents read and write.",
      missing: "That repository was not found with this token.",
      network: "Couldn't reach GitHub.",
      rate: "GitHub's hourly limit is used up. Try again later.",
    }[error && error.kind] || (error && error.message) || "That did not work.";
    return draw();
  }
  view.connectError = "";
  keep.remove("panel.demo");
  keep.remove("panel.cache");
  keep.set("panel.repo", repo);
  keep.set("panel.token", token);
  open(client, false);
  location.hash = "#home";
  draw();
  refresh();
}

function startDemo() {
  keep.set("panel.demo", "1");
  view.connectError = "";
  open(createDemoClient({ fetch: (url, init) => fetch(url, init) }), true);
  location.hash = "#home";
  draw();
  refresh();
}

/** Send one change, and show it pending, or say why it was not sent. */
async function change(element, kind, args, raw) {
  const schema = store.state.files.schema && store.state.files.schema.data;
  const field = fieldFor(schema, kind, args);
  const result = field ? coerce(field.type, raw, field) : { error: "This cannot be changed here" };
  const row = element.closest(".row");
  const errorBox = row && row.querySelector(".row-error");
  if (result.error) {
    if (errorBox) {
      errorBox.textContent = result.error;
      errorBox.hidden = false;
    }
    return;
  }
  try {
    const sending = store.submit(kind, { ...args, value: result.value });
    draw();
    await sending;
  } catch (error) {
    toast(error && error.kind ? "Couldn't send the change. Nothing was changed." : (error && error.message) || "Not sent.");
    draw();
    return false;
  }
  draw();
  return true;
}

/** A priority list is rearranged here first and sent when it is right: every
 *  edit waits for the PC, and a list takes more than one move. */
function stage(ol, list) {
  const row = ol.closest(".row");
  if (row && row.dataset.key) view.staged.set(row.dataset.key, list);
  draw();
}

/** The list a priority control is showing, as [[name, on], ...]. */
const listOf = (ol) => [...ol.querySelectorAll("li")].map((li) =>
  [li.dataset.name, li.querySelector("[data-item]").checked]);

const editOf = (element) => {
  try {
    return { kind: element.dataset.kind, args: JSON.parse(element.dataset.args) };
  } catch {
    return null;
  }
};

document.addEventListener("click", async (event) => {
  const on = (selector) => event.target.closest(selector);
  let hit;
  if (on("[data-refresh]")) return refresh();
  if ((hit = on("[data-period]"))) view.period = hit.dataset.period;
  else if ((hit = on("[data-section]"))) view.section = hit.dataset.section;
  else if ((hit = on("[data-tab]"))) view.tab = hit.dataset.tab;
  else if ((hit = on("[data-open]"))) {
    if (!view.open.delete(hit.dataset.open)) view.open.add(hit.dataset.open);
  } else if ((hit = on("[data-dismiss]"))) store.dismiss(hit.dataset.dismiss);
  else if ((hit = on("[data-cancel]"))) {
    try {
      await store.cancel(hit.dataset.cancel);
    } catch {
      toast("Couldn't cancel it. It is still pending.");
    }
  } else if ((hit = on("[data-move]"))) {
    const ol = hit.closest("ol[data-kind]");
    const li = hit.closest("li");
    const edit = ol && editOf(ol);
    if (!edit || !li) return;
    const list = listOf(ol);
    const from = [...ol.children].indexOf(li);
    const to = from + (hit.dataset.move === "up" ? -1 : 1);
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    return stage(ol, list);
  } else if ((hit = on("[data-send]")) || (hit = on("[data-reset]"))) {
    const row = hit.closest(".row");
    const ol = row && row.querySelector("ol[data-kind]");
    const edit = ol && editOf(ol);
    if (!row || !edit) return;
    if (hit.matches("[data-send]") && !(await change(ol, edit.kind, edit.args, listOf(ol)))) return;
    view.staged.delete(row.dataset.key);
  } else if (on("[data-disconnect]")) return leave();
  else if (on("[data-demo]")) return startDemo();
  else return;
  draw();
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-theme-pick]")) {
    view.theme = THEMES.includes(target.value) ? target.value : "device";
    keep.set("panel.theme", view.theme);
    applyTheme();
    return;
  }
  if (target.matches("[data-item]")) {
    const ol = target.closest("ol[data-kind]");
    if (ol) stage(ol, listOf(ol));
    return;
  }
  if (!target.dataset.kind) return;
  const edit = editOf(target);
  if (edit) change(target, edit.kind, edit.args, target.type === "checkbox" ? target.checked : target.value);
});

document.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-connect]")) return;
  event.preventDefault();
  const form = new FormData(event.target);
  connectWith(String(form.get("repo") || "").trim(), String(form.get("token") || "").trim());
});

window.addEventListener("hashchange", draw);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && now() - lastRefresh > REFRESH_GAP) refresh();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

start();
