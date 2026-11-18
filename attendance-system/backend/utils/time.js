// Timezone-safe date helpers. Attendance dates are stored as 'YYYY-MM-DD'
// strings in the company timezone so a "day" never shifts across UTC.
const { getSettings } = require('../config/settings');

const pad = (n) => String(n).padStart(2, '0');
const tz = () => getSettings().timezone;

function partsInTz(date, timeZone = tz()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
  };
}

function toDateStr(date = new Date(), timeZone) {
  const p = partsInTz(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

const todayStr = () => toDateStr(new Date());

function minutesOfDay(date, timeZone) {
  const p = partsInTz(date, timeZone);
  return p.hour * 60 + p.minute;
}

function parseHHMM(str) {
  const [h, m] = String(str).split(':').map(Number);
  return h * 60 + m;
}

const isHHMM = (s) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

// Convert a local wall-clock time ('YYYY-MM-DD' + 'HH:mm') in the company TZ to a UTC Date
function zonedTimeToUtc(dateStr, timeStr, timeZone = tz()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = partsInTz(new Date(guess), timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return new Date(guess - (asUtc - guess));
}

function formatTime(date, timeZone = tz()) {
  if (!date) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function addDays(str, n) {
  const d = new Date(`${str}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const dayOfWeek = (str) => new Date(`${str}T00:00:00Z`).getUTCDay();

function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function weekRange(str) {
  const dow = dayOfWeek(str);
  const from = addDays(str, dow === 0 ? -6 : 1 - dow); // Monday
  return { from, to: addDays(from, 6) };
}

function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` };
}

const isWeeklyOff = (str) => getSettings().weeklyOffDays.includes(dayOfWeek(str));

module.exports = {
  pad,
  partsInTz,
  toDateStr,
  todayStr,
  minutesOfDay,
  parseHHMM,
  isHHMM,
  zonedTimeToUtc,
  formatTime,
  isValidDateStr,
  addDays,
  dayOfWeek,
  eachDay,
  weekRange,
  monthRange,
  isWeeklyOff,
};
