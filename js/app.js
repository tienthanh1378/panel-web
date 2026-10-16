// The shell: which page is showing, what a tap does, when the repo is read.
// Everything it draws comes from the page modules as HTML; this is the only
// module that touches the document.
import { createClient } from "./github.js";
import { createDemoClient } from "./demo.js";
import { createStore, pcExpected } from "./store.js";
import { coerce, fieldFor } from "./fields.js";
import { EXPIRED_KEYS, SESSION_DAYS, leaveKeys, mayCheck, mayPoll, mayReload, safely, sessionOver } from "./shell.js";
import { movePill, patch, settle, startWeather } from "./motion.js";
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
const nav = document.querySelector(".nav");
const toastBox = document.getElementById("toast");
const now = () => Date.now() / 1000;
const view = {
  period: "today", section: "high", tab: "", open: new Set(), pick: "",
  theme: THEMES.includes(keep.get("panel.theme")) ? keep.get("panel.theme") : "device",
  demo: false, connectError: "", repo: keep.get("panel.repo") || "",
  connected: false,
  // Priority lists rearranged here and not sent yet, by target.
  staged: new Map(),
};
let store = null;
// When this device connected (Unix seconds), kept here as well as in storage
// so a browser that keeps nothing still works for the visit.
let connectedAt = null;
let shown = "";              // the page last drawn, so a change of page is known
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

/** Draw the page on show. A page that has just come up is put in whole and
 *  slides into place; a redraw of the same page changes only what differs, so
 *  nothing that is the same moves. `whole` puts it in whole regardless - for
 *  when what a control shows must be thrown away. */
function draw({ whole = false } = {}) {
  const name = route();
  const entering = name !== shown;
  shown = name;
  const focused = document.activeElement && document.activeElement.id;
  document.body.classList.toggle("connecting", name === "connect");
  view.connected = Boolean(store);
  const html = safely(() =>
    (name === "connect" ? connect.render(store, view, now()) : PAGES[name].render(store, view, now())));
  if (entering || whole) page.innerHTML = html;
  else patch(page, html);
  if (entering) window.scrollTo(0, 0);
  for (const link of document.querySelectorAll("[data-nav]")) {
    if (link.dataset.nav === name) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  settle(page, name, entering);
  movePill(nav);
  if (focused && document.activeElement !== document.getElementById(focused)) {
    const again = document.getElementById(focused);
    if (again && !again.disabled) again.focus({ preventScroll: true });
  }
}

/** The month is up: forget the token and what was read with it, and ask. */
function expire() {
  for (const key of EXPIRED_KEYS) keep.remove(key);
  store = null;
  connectedAt = null;
  view.sessionEnds = null;
  view.staged.clear();
  view.connectError = `It has been ${SESSION_DAYS} days since this device connected. Enter the token again.`;
}

async function refresh() {
  if (store && !view.demo && sessionOver(connectedAt, now())) {
    expire();
    location.hash = "#connect";
    return draw();
  }
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
  connectedAt = null;
  view.demo = false;
  view.sessionEnds = null;
  view.repo = repo || "";
  if (keep.get("panel.demo") === "1") open(createDemoClient({ fetch: (url, init) => fetch(url, init) }), true);
  else if (repo && token) {
    // A device connected before there was a month to count gets one from now.
    const kept = keep.get("panel.connectedAt");
    connectedAt = kept === null ? now() : Number(kept);
    if (kept === null) keep.set("panel.connectedAt", String(connectedAt));
    if (sessionOver(connectedAt, now())) return expire();
    try {
      open(createClient({ repo, token, fetch: (url, init) => fetch(url, init) }), false);
      view.sessionEnds = connectedAt + SESSION_DAYS * 86400;
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
  connectedAt = now();
  keep.set("panel.connectedAt", String(connectedAt));
  open(client, false);
  view.sessionEnds = connectedAt + SESSION_DAYS * 86400;
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
    draw({ whole: true });      // the control goes back to what the PC has
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
  else if ((hit = on("[data-pick]"))) view.pick = view.pick === hit.dataset.pick ? "" : hit.dataset.pick;
  else if (on(".ring")) view.pick = "";
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

// An arc of the Summary ring is a button made of an svg shape: it has to be
// told that Enter and Space are a click.
document.addEventListener("keydown", (event) => {
  const arc = event.target.closest && event.target.closest("circle[data-pick]");
  if (!arc || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  arc.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

window.addEventListener("hashchange", () => draw());
window.addEventListener("resize", () => movePill(nav));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && now() - lastRefresh > REFRESH_GAP) refresh();
});

// While the page is in view and the PC is in a session, or the time it said
// it would be back has come (what the last read of its status says), it reads
// the repo by itself once a minute, so what the PC pushed shows without a tap.
// A PC that waits or sleeps changes nothing until then: the page stays as it
// is, or follows a manual refresh. The timer ticks often; mayPoll holds it to
// the minute counted from the last read, however that began.
setInterval(() => {
  const active = document.activeElement;
  const editing = Boolean(active && active.matches("input, select, textarea"));
  if (!store || view.demo || route() === "connect") return;
  const expected = pcExpected(store.state.files.status, now());
  if (mayPoll({ visible: document.visibilityState === "visible", editing, expected, sinceLast: now() - lastRefresh })) refresh();
}, 15000);

// "Updated 2 min ago" and "in 2h47m" move with the clock, not only with a read.
setInterval(() => {
  const active = document.activeElement;
  const editing = Boolean(active && active.matches("input, select, textarea"));
  if (store && !editing && route() !== "connect" && document.visibilityState === "visible") draw();
}, 30000);

if ("serviceWorker" in navigator) {
  // A new version has taken over from the one that served this page: show it
  // now, unless that would pull the page from under somebody's hands - then
  // it shows when they are done: the next time the page is brought back.
  const hadController = Boolean(navigator.serviceWorker.controller);
  const lastReload = () => {
    try { return Number(sessionStorage.getItem("panel.reloadedAt")) || 0; } catch { return 0; }
  };
  let replaced = false;           // a new version is in charge and this page has not yet reloaded for it
  const reloadForIt = () => {
    const active = document.activeElement;
    const editing = Boolean(active && active.matches("input, select, textarea"));
    if (!replaced || !mayReload({ hadController, editing, staged: view.staged.size, sinceLast: now() - lastReload() })) return;
    try { sessionStorage.setItem("panel.reloadedAt", String(now())); } catch { /* not kept */ }
    location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    replaced = hadController;
    reloadForIt();
  });

  // A page that is brought back, not opened, looks for a new version itself:
  // the browser only does when a page is opened (and a Home Screen app that
  // stays in memory is not).
  let registration = null;
  let lastCheck = now();
  const look = () => {
    if (!registration || !mayCheck({ visible: document.visibilityState === "visible", sinceLast: now() - lastCheck })) return;
    lastCheck = now();
    registration.update().catch(() => {});
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (replaced) reloadForIt();
    else look();
  });
  setInterval(look, 600000);
  navigator.serviceWorker.register("sw.js").then((made) => { registration = made; }).catch(() => {});
}

start();
startWeather(document.querySelector(".backdrop"));
