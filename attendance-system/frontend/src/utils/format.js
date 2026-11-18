export const STATUSES = ['Present', 'Late', 'Half-day', 'Absent', 'Leave'];

export function todayInTz(timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

export function formatTime(iso, timeZone = 'Asia/Kolkata') {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone, hour: '2-digit', minute: '2-digit', hour12: true }).format(
    new Date(iso)
  );
}

// ISO timestamp -> 'HH:mm' (24h) in company timezone, for <input type="time">
export function toHHMM(iso, timeZone = 'Asia/Kolkata') {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(
    new Date(iso)
  );
}

export function formatDate(str, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!str) return '—';
  const d = new Date(str.length === 10 ? `${str}T00:00:00Z` : str);
  return new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: str.length === 10 ? 'UTC' : undefined }).format(d);
}

export function weekday(str) {
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${str}T00:00:00Z`));
}

export function minutesToHM(mins) {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export const money = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

// seconds -> HH:MM:SS
export function hms(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export const hoursDec = (mins) => Math.round(((mins || 0) / 60) * 10) / 10;

export function addDays(str, n) {
  const d = new Date(`${str}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mondayOf(str) {
  const dow = new Date(`${str}T00:00:00Z`).getUTCDay();
  return addDays(str, dow === 0 ? -6 : 1 - dow);
}

export const monthLabel = (ym) =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
