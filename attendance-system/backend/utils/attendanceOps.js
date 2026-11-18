// Self-service attendance actions shared by "My Workspace" and the Attendance Kiosk:
// today's state, clock in / out, start / stop overtime.
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const HttpError = require('./httpError');
const { getSettings } = require('../config/settings');
const { shiftOf, isReg, shiftBounds, shiftAt, syncRecord, dayPhase } = require('./attendanceRules');
const { todayStr, isWeeklyOff } = require('./time');

const OT_REASONS = ['Worked extra time (overtime)', 'Leaving early', 'Forgot to clock out', 'Site / client visit', 'Other'];
const hhmm = (d) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: getSettings().timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(d));

async function loadDay(user) {
  const date = todayStr();
  const [record, leave, holiday] = await Promise.all([
    Attendance.findOne({ employee: user._id, date }),
    Leave.findOne({ employee: user._id, status: 'Approved', fromDate: { $lte: date }, toDate: { $gte: date } }),
    Holiday.findOne({ date }),
  ]);
  const dayOff = !!holiday || isWeeklyOff(date);
  return { date, record, leave, holiday, dayOff };
}

// Why overtime can't be started right now (null when it can)
function otBlocker(day, now = new Date()) {
  const { record, leave, dayOff, date } = day;
  if (record && record.source === 'admin' && record.sessions.length === 0) return 'Attendance for today was already recorded by HR';
  const sessions = record?.sessions || [];
  if (sessions.some((s) => !isReg(s) && !s.out)) return 'Overtime is already running';
  if (sessions.some((s) => isReg(s) && !s.out)) return 'You are on a shift right now. Clock out first, or use “Record out time”';
  const inShift = shiftAt(date, now);
  if (inShift && !dayOff && !leave && record?.status !== 'Leave') {
    return `Overtime can be started outside shift hours (now inside the ${inShift.label.toLowerCase()} shift ${inShift.start}–${inShift.end})`;
  }
  return null;
}

async function todayState(user) {
  const day = await loadDay(user);
  const { date, record, leave, holiday, dayOff } = day;
  const now = new Date();
  if (record && syncRecord(record, now, { dayOff })) await record.save();

  const otRunning = record?.sessions.find((s) => !isReg(s) && !s.out) || null;
  let phase;
  if (holiday) phase = { phase: 'holiday', note: holiday.name };
  else if (record && record.source === 'admin' && record.sessions.length === 0) phase = { phase: 'admin' };
  else if (record?.status === 'Leave' || leave) phase = { phase: 'leave' };
  else phase = dayPhase(record, date, now);
  phase.ot = otRunning;

  const s = getSettings();
  return {
    date,
    serverTime: now,
    record,
    phase,
    shifts: s.shifts.map((sh) => {
      const b = shiftBounds(date, sh);
      return { ...sh, startAt: b.start, endAt: b.end, opensAt: b.opensAt };
    }),
    weeklyOff: isWeeklyOff(date),
    expectedHours: dayOff ? 0 : s.expectedDailyHours,
    lateGraceMinutes: s.lateGraceMinutes,
    otReasons: OT_REASONS,
    otBlocked: otBlocker(day, now),
  };
}

async function clockIn(user) {
  const state = await todayState(user);
  if (state.phase.phase !== 'clockable') {
    const msg = {
      open: 'You are already clocked in',
      holiday: 'Today is a holiday. Use OT to log overtime',
      leave: 'You are on approved leave today',
      admin: 'Your attendance for today was already recorded by HR',
    }[state.phase.phase];
    throw new HttpError(400, msg || 'Clock in is not open right now');
  }
  const now = new Date();
  const shift = state.phase.shift;
  let record = state.record;
  if (!record) record = new Attendance({ employee: user._id, date: state.date, status: 'Present', source: 'self', sessions: [] });
  let extra = '';
  const ot = record.sessions.find((s) => !isReg(s) && !s.out);
  if (ot) {
    ot.out = now;
    extra = ' · overtime stopped';
  }
  record.sessions.push({ shift, in: now });
  syncRecord(record, now);
  await record.save();
  return `Clocked in at ${hhmm(now)} for the ${shiftOf(shift).label.toLowerCase()} shift${record.status === 'Late' ? ' (late)' : ''}${extra}`;
}

async function clockOut(user) {
  const { record, dayOff } = await loadDay(user);
  const open = record?.sessions.find((s) => isReg(s) && !s.out);
  if (!open) throw new HttpError(400, 'You are not clocked in to a shift');
  const now = new Date();
  open.out = now;
  syncRecord(record, now, { dayOff });
  await record.save();
  return `Clocked out at ${hhmm(now)}`;
}

async function otStart(user) {
  const day = await loadDay(user);
  const reason = otBlocker(day);
  if (reason) throw new HttpError(400, reason);
  const now = new Date();
  let { record } = day;
  if (!record) record = new Attendance({ employee: user._id, date: day.date, status: 'Present', source: 'self', sessions: [] });
  record.sessions.push({ shift: 'ot', in: now });
  syncRecord(record, now, { dayOff: day.dayOff });
  await record.save();
  return `Overtime started at ${hhmm(now)}`;
}

async function otStop(user) {
  const { record, dayOff } = await loadDay(user);
  const ot = record?.sessions.find((s) => !isReg(s) && !s.out);
  if (!ot) throw new HttpError(400, 'No overtime is running');
  const now = new Date();
  ot.out = now;
  syncRecord(record, now, { dayOff });
  await record.save();
  const mins = Math.max(0, Math.round((now - ot.in) / 60000));
  return `Overtime stopped at ${hhmm(now)} · ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m recorded`;
}

module.exports = { OT_REASONS, todayState, clockIn, clockOut, otStart, otStop, loadDay };
