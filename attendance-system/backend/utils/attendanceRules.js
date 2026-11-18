// Shift-based attendance rules.
// A day has sessions: one per shift { shift: 'morning'|'afternoon', in, out, auto, manual, reason, note }
// plus optional overtime sessions { shift: 'ot', in, out } started with "Start OT".
// From the sessions we derive check-in/out, worked minutes, overtime and the day's status.
const { getSettings } = require('../config/settings');
const { zonedTimeToUtc, isWeeklyOff } = require('./time');

const STATUSES = ['Present', 'Absent', 'Late', 'Half-day', 'Leave'];
const OT_SHIFT = { key: 'ot', label: 'Overtime', start: '00:00', end: '23:59' };

const shiftOf = (key) => (key === 'ot' ? OT_SHIFT : getSettings().shifts.find((s) => s.key === key));
const isReg = (s) => s.shift !== 'ot';
const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));

// Real Date objects for a shift on a given 'YYYY-MM-DD'
function shiftBounds(date, shift) {
  const s = getSettings();
  const start = zonedTimeToUtc(date, shift.start);
  const end = zonedTimeToUtc(date, shift.end);
  const opensAt = new Date(start.getTime() - s.openEarlyMinutes * 60000);
  return { start, end, opensAt };
}

// The regular shift the given moment falls inside (or undefined)
function shiftAt(date, now = new Date()) {
  return getSettings().shifts.find((sh) => {
    const b = shiftBounds(date, sh);
    return now >= b.start && now < b.end;
  });
}

/**
 * Auto clock-out open sessions whose shift has ended (overtime closes at 23:59),
 * then recompute aggregates and status. Works on a Mongoose document or a plain object.
 * opts.dayOff: true for holidays / weekly offs (overtime-only days count as Present).
 * Returns true if anything changed (so the caller knows to save).
 */
function syncRecord(rec, now = new Date(), opts = {}) {
  if (!rec || !rec.sessions || rec.sessions.length === 0) return false;
  const s = getSettings();
  const dayOff = opts.dayOff ?? isWeeklyOff(rec.date);
  let changed = false;

  for (const ses of rec.sessions) {
    if (!ses.out) {
      const { end } = shiftBounds(rec.date, shiftOf(ses.shift));
      if (now >= end) {
        ses.out = end;
        ses.auto = true;
        changed = true;
      }
    }
  }

  const ordered = [...rec.sessions].sort((a, b) => new Date(a.in) - new Date(b.in));
  const closed = ordered.filter((x) => x.out);
  const last = ordered[ordered.length - 1];

  const checkIn = ordered[0].in;
  const checkOut = last.out || null;
  const workMinutes = closed.reduce((sum, x) => sum + minutesBetween(x.in, x.out), 0);
  const otMinutes = closed.reduce(
    (sum, x) => sum + (isReg(x) ? minutesBetween(shiftBounds(rec.date, shiftOf(x.shift)).end, x.out) : minutesBetween(x.in, x.out)),
    0
  );

  if (String(rec.checkIn) !== String(checkIn) || String(rec.checkOut) !== String(checkOut)) changed = true;
  if (rec.workMinutes !== workMinutes || rec.otMinutes !== otMinutes) changed = true;
  Object.assign(rec, { checkIn, checkOut, workMinutes, otMinutes });

  if (rec.source !== 'admin' && rec.status !== 'Leave') {
    const reg = ordered.filter(isReg);
    let status;
    let autoHalf = false;
    if (!reg.length) {
      // Overtime only: fine on a day off; on a working day both shifts were missed
      const lastEnd = shiftBounds(rec.date, s.shifts[s.shifts.length - 1]).end;
      status = dayOff || now < lastEnd ? 'Present' : 'Absent';
    } else {
      const missed = s.shifts.filter((sh) => !reg.some((x) => x.shift === sh.key) && now >= shiftBounds(rec.date, sh).end).length;
      const first = reg[0];
      const firstStart = shiftBounds(rec.date, shiftOf(first.shift)).start;
      const late = new Date(first.in) - firstStart > s.lateGraceMinutes * 60000;
      autoHalf = missed > 0;
      status = missed > 0 ? 'Half-day' : late ? 'Late' : 'Present';
    }
    if (rec.status !== status || rec.autoHalf !== autoHalf) changed = true;
    rec.status = status;
    rec.autoHalf = autoHalf;
  }
  return changed;
}

/**
 * Where the person is in the working day (overtime sessions are ignored here):
 * open (clocked in) | clockable (a shift window is open) | before | break | done
 */
function dayPhase(rec, date, now = new Date()) {
  const s = getSettings();
  const sessions = (rec?.sessions || []).filter(isReg);
  const open = sessions.find((x) => !x.out);
  if (open) return { phase: 'open', shift: open.shift };

  for (const sh of s.shifts) {
    const b = shiftBounds(date, sh);
    if (!sessions.some((x) => x.shift === sh.key) && now >= b.opensAt && now < b.end) {
      return { phase: 'clockable', shift: sh.key };
    }
  }
  const next = s.shifts.find((sh) => now < shiftBounds(date, sh).opensAt);
  if (next) return { phase: sessions.length ? 'break' : 'before', shift: next.key };
  return { phase: 'done' };
}

module.exports = { STATUSES, OT_SHIFT, shiftOf, isReg, shiftBounds, shiftAt, syncRecord, dayPhase, minutesBetween };
