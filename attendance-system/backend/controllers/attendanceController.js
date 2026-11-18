const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Holiday = require('../models/Holiday');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { getSettings } = require('../config/settings');
const { STATUSES, shiftOf, isReg, shiftBounds, syncRecord, minutesBetween } = require('../utils/attendanceRules');
const ops = require('../utils/attendanceOps');
const { holidayMap } = require('../utils/calendar');
const { todayStr, isValidDateStr, isHHMM, zonedTimeToUtc, monthRange, isWeeklyOff } = require('../utils/time');

function summarize(records) {
  const s = { Present: 0, Late: 0, 'Half-day': 0, Absent: 0, Leave: 0, workMinutes: 0, otMinutes: 0 };
  for (const r of records) {
    s[r.status] += 1;
    s.workMinutes += r.workMinutes || 0;
    s.otMinutes += r.otMinutes || 0;
  }
  return s;
}

// Sync (auto clock-out) any of today's records before returning them
async function syncAndSave(records, now = new Date()) {
  await Promise.all(records.map((r) => (syncRecord(r, now) ? r.save() : null)));
  return records;
}

/* ---------------- Self-service (employees and admins) ---------------- */

// GET /api/attendance/today
exports.today = asyncHandler(async (req, res) => {
  res.json(await ops.todayState(req.user));
});

const action = (fn) =>
  asyncHandler(async (req, res) => {
    const message = await fn(req.user);
    res.json({ message, ...(await ops.todayState(req.user)) });
  });

// POST /api/attendance/clock-in | clock-out | ot/start | ot/stop
exports.clockIn = action(ops.clockIn);
exports.clockOut = action(ops.clockOut);
exports.otStart = action(ops.otStart);
exports.otStop = action(ops.otStop);

// POST /api/attendance/out-time   { shift, time: 'HH:mm', reason, note }
// "OT (Out Time)": record the actual out time for today's session.
// Later than shift end => counted as overtime; earlier => left early.
exports.outTime = asyncHandler(async (req, res) => {
  const { shift, time, reason, note = '' } = req.body || {};
  if (!isHHMM(time || '')) throw new HttpError(400, 'Out time must be HH:mm');
  if (!ops.OT_REASONS.includes(reason)) throw new HttpError(400, 'Please choose a reason');

  const date = todayStr();
  const record = await Attendance.findOne({ employee: req.user._id, date });
  const session = record?.sessions.find((s) => isReg(s) && s.shift === shift);
  if (!session) throw new HttpError(400, 'No clock-in found for that shift today');

  const out = zonedTimeToUtc(date, time);
  const now = new Date();
  if (out <= session.in) throw new HttpError(400, 'Out time must be after your clock-in');
  if (out > now) throw new HttpError(400, 'Out time cannot be in the future');
  const next = record.sessions.find((s) => isReg(s) && s.in > session.in);
  if (next && out > next.in) throw new HttpError(400, `Out time overlaps your ${next.shift} shift clock-in`);

  Object.assign(session, { out, manual: true, auto: false, reason, note: String(note).slice(0, 200) });
  syncRecord(record, now);
  await record.save();

  const ot = minutesBetween(shiftBounds(date, shiftOf(shift)).end, out);
  res.json({ message: ot ? `Out time saved · +${Math.floor(ot / 60)}h ${String(ot % 60).padStart(2, '0')}m overtime` : 'Out time saved', ...(await ops.todayState(req.user)) });
});

// GET /api/attendance/me?month=YYYY-MM   or   ?from=YYYY-MM-DD&to=YYYY-MM-DD
exports.myHistory = asyncHandler(async (req, res) => {
  let from;
  let to;
  if (req.query.from || req.query.to) {
    ({ from, to } = req.query);
    if (!isValidDateStr(from) || !isValidDateStr(to) || to < from) throw new HttpError(400, 'Invalid date range');
  } else {
    const month = req.query.month || todayStr().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Month must be YYYY-MM');
    ({ from, to } = monthRange(month));
  }
  const records = await Attendance.find({ employee: req.user._id, date: { $gte: from, $lte: to } }).sort({ date: -1 });
  await syncAndSave(records.filter((r) => r.date === todayStr()));
  const holidays = [...(await holidayMap(from, to))].map(([date, name]) => ({ date, name }));
  res.json({ from, to, records, holidays, summary: summarize(records) });
});

/* ---------------- Admin: team timesheet ---------------- */

// GET /api/attendance/team?date=YYYY-MM-DD
exports.team = asyncHandler(async (req, res) => {
  const date = req.query.date || todayStr();
  if (!isValidDateStr(date)) throw new HttpError(400, 'Invalid date');
  const employees = await User.find({ role: 'employee', status: 'active', $or: [{ joinDate: '' }, { joinDate: { $lte: date } }] })
    .select('name employeeId department designation')
    .sort({ name: 1 });
  const records = await Attendance.find({ date, employee: { $in: employees.map((e) => e._id) } });
  if (date === todayStr()) await syncAndSave(records);
  const byEmp = new Map(records.map((r) => [String(r.employee), r]));
  const holiday = await Holiday.findOne({ date });
  res.json({
    date,
    holiday: holiday?.name || null,
    shifts: getSettings().shifts,
    rows: employees.map((e) => ({ employee: e, record: byEmp.get(String(e._id)) || null })),
  });
});

/* ---------------- Admin: daily register ---------------- */

// GET /api/attendance/register?date=YYYY-MM-DD
exports.register = asyncHandler(async (req, res) => {
  const date = req.query.date || todayStr();
  if (!isValidDateStr(date)) throw new HttpError(400, 'Invalid date');

  const employees = await User.find({
    role: 'employee',
    status: 'active',
    $or: [{ joinDate: '' }, { joinDate: { $lte: date } }],
  })
    .select('name employeeId department designation')
    .sort({ name: 1 });
  const records = await Attendance.find({ date, employee: { $in: employees.map((e) => e._id) } });
  if (date === todayStr()) await syncAndSave(records);
  const byEmp = new Map(records.map((r) => [String(r.employee), r]));
  const holiday = await Holiday.findOne({ date });

  const rows = employees.map((e) => ({ employee: e, record: byEmp.get(String(e._id)) || null }));
  res.json({ date, isWeeklyOff: isWeeklyOff(date), holiday: holiday?.name || null, rows, summary: summarize(records), total: employees.length });
});

// POST /api/attendance/bulk  { date, records: [{ employee, status, checkIn:'HH:mm', checkOut:'HH:mm', remarks }] }
// Admin entries replace the employee's shift sessions for that day.
exports.bulkMark = asyncHandler(async (req, res) => {
  const { date, records } = req.body || {};
  if (!isValidDateStr(date)) throw new HttpError(400, 'Invalid date');
  if (date > todayStr()) throw new HttpError(400, 'Cannot mark attendance for a future date');
  if (!Array.isArray(records) || records.length === 0) throw new HttpError(400, 'No records to save');
  const lastShiftEnd = shiftBounds(date, getSettings().shifts.at(-1)).end;

  const ops = records.map((r) => {
    if (!STATUSES.includes(r.status)) throw new HttpError(400, `Invalid status: ${r.status}`);
    const noTimes = r.status === 'Absent' || r.status === 'Leave';
    if (!noTimes) {
      if (r.checkIn && !isHHMM(r.checkIn)) throw new HttpError(400, 'Check-in must be HH:mm');
      if (r.checkOut && !isHHMM(r.checkOut)) throw new HttpError(400, 'Check-out must be HH:mm');
    }
    const checkIn = !noTimes && r.checkIn ? zonedTimeToUtc(date, r.checkIn) : null;
    const checkOut = !noTimes && r.checkOut ? zonedTimeToUtc(date, r.checkOut) : null;
    if (checkIn && checkOut && checkOut <= checkIn) throw new HttpError(400, 'Check-out must be after check-in');

    return {
      updateOne: {
        filter: { employee: r.employee, date },
        update: {
          $set: {
            status: r.status,
            sessions: [],
            checkIn,
            checkOut,
            workMinutes: checkIn && checkOut ? minutesBetween(checkIn, checkOut) : 0,
            otMinutes: checkOut ? minutesBetween(lastShiftEnd, checkOut) : 0,
            autoHalf: false,
            remarks: (r.remarks || '').slice(0, 300),
            source: 'admin',
            markedBy: req.user._id,
          },
        },
        upsert: true,
      },
    };
  });

  const result = await Attendance.bulkWrite(ops, { ordered: false });
  res.json({ message: `Attendance saved for ${records.length} employee(s)`, modified: result.modifiedCount, created: result.upsertedCount });
});

// POST /api/attendance/mark-absent { date } - marks every unmarked active employee Absent
exports.markAbsent = asyncHandler(async (req, res) => {
  const date = req.body?.date || todayStr();
  if (!isValidDateStr(date)) throw new HttpError(400, 'Invalid date');

  const employees = await User.find({
    role: 'employee',
    status: 'active',
    $or: [{ joinDate: '' }, { joinDate: { $lte: date } }],
  }).select('_id');
  const marked = await Attendance.distinct('employee', { date });
  const markedSet = new Set(marked.map(String));
  const missing = employees.filter((e) => !markedSet.has(String(e._id)));
  if (!missing.length) return res.json({ message: 'All employees are already marked', count: 0 });

  await Attendance.insertMany(
    missing.map((e) => ({ employee: e._id, date, status: 'Absent', source: 'admin', markedBy: req.user._id })),
    { ordered: false }
  );
  res.json({ message: `${missing.length} employee(s) marked Absent`, count: missing.length });
});

// DELETE /api/attendance/:id
exports.remove = asyncHandler(async (req, res) => {
  const rec = await Attendance.findByIdAndDelete(req.params.id);
  if (!rec) throw new HttpError(404, 'Record not found');
  res.json({ message: 'Attendance record removed' });
});

// GET /api/attendance/employee/:id?month=YYYY-MM   (admin: one employee's month)
exports.employeeMonth = asyncHandler(async (req, res) => {
  const month = req.query.month || todayStr().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, 'Month must be YYYY-MM');
  const { from, to } = monthRange(month);
  const records = await Attendance.find({ employee: req.params.id, date: { $gte: from, $lte: to } }).sort({ date: -1 });
  const holidays = [...(await holidayMap(from, to))].map(([date, name]) => ({ date, name }));
  res.json({ month, records, holidays, summary: summarize(records) });
});
