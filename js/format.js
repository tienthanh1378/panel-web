// How values read on a page. Everything here returns plain text; esc() is
// what makes text safe to put into an HTML string.

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Text, safe inside HTML and inside a quoted attribute. */
export function esc(text) {
  if (text === null || text === undefined) return "";
  return String(text).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}

/** 44000000 -> "44.0M". Nothing, or zero, is a dash. */
export function amount(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n === 0) return "-";
  const size = Math.abs(n);
  if (size >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (size >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (size >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

/** 9660 -> "2h 41m". */
export function duration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return "-";
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

const two = (n) => String(n).padStart(2, "0");
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A moment as this device's clock has it: "09:46", or "Mon 09:46" when it
 *  was not on the day `now` is in. */
export function clockTime(unixSeconds, now) {
  if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return "";
  const then = new Date(unixSeconds * 1000);
  const today = new Date(now * 1000);
  const time = `${two(then.getHours())}:${two(then.getMinutes())}`;
  const sameDay = then.getFullYear() === today.getFullYear()
    && then.getMonth() === today.getMonth() && then.getDate() === today.getDate();
  return sameDay ? time : `${DAYS[then.getDay()]} ${time}`;
}
