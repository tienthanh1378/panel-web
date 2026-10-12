// Summary: what was gathered over a period, and a row a day. The PC sends
// the days; the only sums made here are a period's totals.
import { esc, amount, duration } from "../format.js";
import { EMPTY, dataOf, pick, plural, top } from "./parts.js";

const PERIODS = [["today", "Today"], ["yesterday", "Yesterday"], ["7", "7 days"], ["30", "30 days"]];
const RESOURCES = [["food", "Food"], ["wood", "Wood"], ["stone", "Stone"], ["gold", "Gold"]];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86400000;

const number = (value) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** "2026-10-12" as a day count, or null if it is not a date. */
function dayNumber(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ""));
  return m ? Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS) : null;
}

function dayLabel(text) {
  const n = dayNumber(text);
  if (n === null) return String(text);
  const date = new Date(n * DAY_MS);
  return `${DAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

/** The days of a period, counted back from the PC's own "today". */
function daysIn(summary, period) {
  const days = Array.isArray(summary.days) ? summary.days : [];
  const today = dayNumber(summary.today) ?? dayNumber(days[0] && days[0].day);
  if (today === null) return [];
  const back = (day) => {
    const n = dayNumber(day.day);
    return n === null ? -1 : today - n;
  };
  const within = { today: [0, 0], yesterday: [1, 1], 7: [0, 6], 30: [0, 29] }[period] || [0, 0];
  return days.filter((day) => back(day) >= within[0] && back(day) <= within[1]);
}

const totalOf = (gained) => RESOURCES.reduce((sum, [key]) => sum + number((gained || {})[key]), 0);
const round2 = (value) => Math.round(value * 100) / 100;

/** The period's shares as a ring: an arc a resource, food first, each
 *  starting where the one before it ended. */
function ring(gained) {
  const total = totalOf(gained);
  if (!total) return "";
  let before = 0;
  const arcs = RESOURCES.filter(([key]) => number(gained[key]) > 0).map(([key], i, all) => {
    // the last arc takes what is left, so rounding never leaves a gap
    const share = i === all.length - 1 ? round2(100 - before) : round2(number(gained[key]) / total * 100);
    const arc = `<circle class="arc res-${key}" cx="20" cy="20" r="15.9155" pathLength="100" `
      + `stroke-dasharray="${share} 100" stroke-dashoffset="${before === 0 ? 0 : -before}"/>`;
    before = round2(before + share);
    return arc;
  }).join("");
  return '<svg class="ring" viewBox="0 0 40 40" role="img" aria-label="The share of each resource">'
    + `<g transform="rotate(-90 20 20)"><circle class="ring-track" cx="20" cy="20" r="15.9155"/>${arcs}</g></svg>`;
}

const BAR_HEIGHT = 40;
const BAR_STEP = 10;
const BAR_WIDTH = 6;

/** A stacked bar a day, oldest on the left, food at the bottom; the day that
 *  gathered most is the full height. */
function bars(days) {
  if (days.length < 2) return "";
  const oldestFirst = [...days].reverse();
  const most = Math.max(...oldestFirst.map((day) => totalOf(day.gained)));
  if (!most) return "";
  const drawn = oldestFirst.map((day, i) => {
    let y = BAR_HEIGHT;
    const stack = RESOURCES.map(([key]) => {
      const height = round2(number((day.gained || {})[key]) / most * BAR_HEIGHT);
      if (!height) return "";
      y = round2(y - height);
      return `<rect class="res-${key}" x="${i * BAR_STEP + (BAR_STEP - BAR_WIDTH) / 2}" y="${y}" width="${BAR_WIDTH}" height="${height}"/>`;
    }).join("");
    return `<g class="bar" data-day="${esc(day.day)}">${stack}</g>`;
  }).join("");
  return `<svg class="bars" viewBox="0 0 ${oldestFirst.length * BAR_STEP} ${BAR_HEIGHT}" preserveAspectRatio="none" role="img" aria-label="Gathered each day">${drawn}</svg>`;
}

function dayRow(day, open) {
  const people = open ? (Array.isArray(day.characters) ? day.characters : []).map((who) =>
    `<li><span class="who-name">${esc(who.name)}</span>`
    + `<span>${esc(amount(number(who.total)))} · ${esc(duration(number(who.seconds)))}</span></li>`).join("") : "";
  return `<article class="card day${open ? " open" : ""}">`
    + `<button type="button" class="day-head" data-open="${esc(day.day)}" aria-expanded="${open ? "true" : "false"}">`
    + `<span>${esc(dayLabel(day.day))}</span><span>${esc(amount(totalOf(day.gained)))}</span></button>`
    + (open ? `<ul class="day-list">${people || "<li>No characters</li>"}</ul>` : "")
    + "</article>";
}

export function render(store, view, now) {
  const summary = dataOf(store, "summary");
  const zone = summary ? `<p class="top-sub">Days counted in ${summary.zone === "local" ? "the PC's local time" : "UTC"}</p>` : "";
  const header = top("Summary", store, "summary", view, now, zone);
  if (!summary) return header + EMPTY;

  const period = PERIODS.some(([id]) => id === view.period) ? view.period : "today";
  const days = daysIn(summary, period);
  const sum = (key) => days.reduce((total, day) => total + number(day[key]), 0);
  const gained = Object.fromEntries(RESOURCES.map(([key]) =>
    [key, days.reduce((total, day) => total + number((day.gained || {})[key]), 0)]));

  const chips = PERIODS.map(([id, label]) => pick("period", id, label, id === period)).join("");
  const tiles = [["Total", totalOf(gained), " tile-total"], ...RESOURCES.map(([key, label]) => [label, gained[key], ` tile-${key}`])]
    .map(([label, value, extra]) =>
      `<div class="tile${extra}"><b data-count="${number(value)}" data-as="amount">${esc(amount(value))}</b><span>${label}</span></div>`).join("");
  const pictures = ring(gained) + bars(days);
  const chart = pictures ? `<div class="chart card">${pictures}</div>` : "";
  const line = days.length
    ? `<p class="sum-line">${plural(sum("cycles"), "cycle")} · ${sum("research")} research · ${sum("training")} trained · ${esc(duration(sum("seconds")))}</p>`
    : '<p class="empty">Nothing ran in this period</p>';
  const open = view.open instanceof Set ? view.open : new Set();

  return header
    + `<div class="picks">${chips}</div>`
    + `<div class="tiles tiles-sum">${tiles}</div>`
    + chart
    + line
    + (days.length ? `<h2>By day</h2>${days.map((day) => dayRow(day, open.has(day.day))).join("")}` : "");
}
